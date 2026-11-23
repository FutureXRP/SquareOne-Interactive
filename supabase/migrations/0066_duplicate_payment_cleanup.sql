-- 0066: clean up Stripe payments that were recorded twice.
--
-- One Stripe charge sends two notices (checkout finished + payment
-- succeeded). Before 0060 both could be recorded, and 0060's guard (a
-- unique index on the Stripe reference) was skipped because copies
-- already existed. Worse, once two copies exist the app's "already
-- recorded?" check misread them as none, so a repeat notice could record
-- a third. The money was charged ONCE; the copies only inflate "paid so
-- far" on the booking and in reports.
--
-- For each Stripe charge recorded more than once:
--   * one record is kept — the one a refund is attached to, else the
--     earliest;
--   * every other copy is marked VOIDED (nothing is deleted) with a note
--     naming the record it duplicates. No email goes to anyone.
-- Then the guard is added, so a charge can only ever be recorded once.
--
-- Bookings are NOT changed. The results list every booking touched, and
-- flag any that are confirmed but, with the copies removed, have less
-- than their deposit paid — the double count may have confirmed them.
-- Those are for a person to look at (keep without deposit, or follow up).
-- Run after 0065_no_false_alarms.sql.

create temp table dup_payments (
  intent text, payment_id uuid, code text, booking_id uuid, amount_cents int,
  created_at timestamptz, keep boolean, has_refund boolean
) on commit preserve rows;

insert into dup_payments
select p.stripe_payment_intent_id, p.id, p.code, p.booking_id, p.amount_cents, p.created_at,
       row_number() over (
         partition by p.stripe_payment_intent_id
         order by exists (select 1 from refunds r where r.payment_id = p.id) desc,
                  (p.status = 'paid') desc, p.created_at, p.id
       ) = 1,
       exists (select 1 from refunds r where r.payment_id = p.id)
  from payments p
 where p.status <> 'voided'
   and p.stripe_payment_intent_id in (
     select stripe_payment_intent_id from payments
      where stripe_payment_intent_id is not null and status <> 'voided'
      group by stripe_payment_intent_id having count(*) > 1);

-- Void the extra copies. A copy that has its own refund attached is left
-- for a person (it's listed below) — voiding it would hide real money.
update payments p
   set status = 'voided', voided_at = now(),
       memo = coalesce(p.memo || ' · ', '') || 'duplicate of '
              || (select k.code from dup_payments k where k.intent = d.intent and k.keep)
              || ' (same Stripe charge, recorded twice)'
  from dup_payments d
 where p.id = d.payment_id and not d.keep and not d.has_refund;

-- The guard: one live record per Stripe charge. (Voided copies keep their
-- reference for the record, so they're left out of it.)
drop index if exists payments_stripe_ref_unique;
do $$
begin
  if exists (
    select 1 from payments where stripe_payment_intent_id is not null and status <> 'voided'
     group by stripe_payment_intent_id having count(*) > 1
  ) then
    raise notice 'Some copies have refunds attached and were left for a person — guard not added yet';
  else
    create unique index payments_stripe_ref_unique on payments (stripe_payment_intent_id)
      where stripe_payment_intent_id is not null and status <> 'voided';
  end if;
end $$;

-- What was done, booking by booking.
select coalesce(b.code, '(no booking)') as booking,
       coalesce(b.client_name, '') as customer,
       to_char(d.amount_cents / 100.0, 'FM$999,990.00') as charge,
       (select k.code from dup_payments k where k.intent = d.intent and k.keep) as kept,
       string_agg(d.code, ', ') filter (where not d.keep) as copies,
       case
         when bool_or(not d.keep and d.has_refund) then 'NEEDS A PERSON — a copy has a refund attached; tell Claude'
         when b.status = 'confirmed'
              and coalesce(b.deposit_cents, 0) > 0
              and (select coalesce(sum(p.amount_cents), 0) from payments p
                    where p.booking_id = b.id and p.status = 'paid') < b.deposit_cents
           then 'Copies voided — CHECK: confirmed, but less than the deposit is actually paid'
         else 'Copies voided — nothing else to do'
       end as result
  from dup_payments d
  left join bookings b on b.id = d.booking_id
 group by d.intent, d.amount_cents, b.id, b.code, b.client_name, b.status, b.deposit_cents
 order by min(d.created_at);

select case when exists (select 1 from pg_indexes where indexname = 'payments_stripe_ref_unique')
            then 'OK — duplicate Stripe payments are now blocked'
            else 'ATTENTION — guard not added; send Claude the rows above'
       end as payment_guard;
