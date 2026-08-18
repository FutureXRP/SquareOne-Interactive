-- 0041: undo for a mistakenly recorded desk payment.
-- Staff sometimes record cash, or confirm a Cash App payment, that turns
-- out not to have happened. The fix is a void, not a delete: the row
-- stays in the table flipped to status 'voided' (stamped with who and
-- when), so the books show it was entered and struck — but every
-- balance, report, and booking total in the app counts only rows with
-- status = 'paid', so a voided payment vanishes from all of them at once.

alter type payment_status add value if not exists 'voided';

alter table payments add column if not exists voided_by uuid references staff(id);
alter table payments add column if not exists voided_at timestamptz;

-- Staff may void desk-recorded rows only. Stripe rows are real card
-- charges — money that actually moved — and leave the books through a
-- refund, never an edit.
drop policy if exists "staff void payments" on payments;
create policy "staff void payments" on payments
  for update using (is_staff() and method <> 'stripe')
  with check (is_staff());

-- Belt and braces: the only columns a signed-in browser can change on a
-- payment are the void markers. Amounts, methods, and codes stay
-- immutable from the client; server routes use the service role and are
-- unaffected.
revoke update on payments from authenticated;
grant update (status, voided_by, voided_at) on payments to authenticated;
