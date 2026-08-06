# CLAUDE.md — SquareOne Interactive Platform

## What this is

A custom facility-management platform + public store for **SquareOne Interactive**
(fitness center + family entertainment center, Tulsa, OK — part of SquareOne
Compassion, a 501(c)(3)). This replaces **Amilia SmartRec** entirely: admin
dashboard, booking engine, memberships, programs, payments, POS, check-in/door
access, forms/waivers, communications, and the public-facing store.

- Public site (must flow with): https://www.squareonecompassion.com
- Current system being replaced: Amilia SmartRec
  (store at app.amilia.com/store/en/squareonecompassion)
- Facility: 5323 S 65th W Ave, Tulsa, OK 74107
- Hours: Mon–Sat 5:30 AM–10 PM · Sun 1–10 PM
- Sibling system: SquareOne facility dashboard (door access + thermostats,
  synced with room rentals). This platform must integrate with it — bookings
  drive door schedules and HVAC pre-conditioning.

## Stack (do not deviate without asking)

- **Next.js (App Router)** on **Vercel**
- **Supabase** — Postgres, Auth, RLS, Realtime (live door log / occupancy),
  Storage (waiver PDFs, receipts)
- **Stripe** — cards, ACH, saved payment methods, Subscriptions for
  memberships, invoices for rentals. Lean on Stripe machinery for retries,
  dunning, proration. Never store raw card data.
- **Anthropic API** — language tasks only (drafting member emails, summarizing
  reports). Never calculations.

## Engineering conventions (house rules — always apply)

1. **Complete file replacements over surgical patches.**
2. **One batch commit per session.**
3. **Integer arithmetic for all money.** Amounts are integer cents everywhere
   (DB, API, UI logic). Format to dollars only at render time.
4. **LLM handles language only; deterministic code handles all calculations.**
5. **Seeded RNG** anywhere randomness appears (demo data, IDs in tests).
6. **Fabrication firewall:** no unverified value may render as authoritative.
   Placeholder/demo data must be labeled as such in the UI.
7. Ship-first, then iterate. Working vertical slice > perfect module.

## Two apps, one database

| App | Audience | Route group | Notes |
|---|---|---|---|
| **Dashboard** | Staff/admins | `/admin/*` | Auth-gated, role-based (owner, manager, front-desk, coach) |
| **Store** | Public/members | `/(store)/*` | Memberships, facility booking, program registration, party booking, member portal |

Both read the same Supabase schema. RLS enforces the boundary:
staff roles via `staff.role`; members see only their own account data.

## Core data model (build in this order)

```
organizations            -- single row now; future-proof for ELC/Medical arms
facilities               -- Gym, Gaming Zone, Dining Hall, Multiball, Multisport,
                            Party Arcade, Adventure Zone, Billiards
booking_types            -- color-coded categories (see zone colors below)
price_schedules          -- per-hour and flat-fee (2-hr / 3-hr rental patterns)
bookings                 -- tstzrange `during`; EXCLUDE USING gist
                            (facility_id WITH =, during WITH &&) — hard
                            double-booking prevention at the DB level
booking_holds            -- tentative blocks with `expires_at` + deposit status;
                            auto-release job on expiry
client_accounts          -- the billable unit (family accounts)
clients                  -- people; many-to-one with accounts
membership_plans         -- Family $75 / Individual $25, ongoing (Stripe Price IDs)
member_subscriptions     -- Stripe subscription mirror + status
programs / activities    -- e.g. Speed & Agility
activity_occurrences     -- recurring schedule expansion
registrations            -- session + drop-in, capacity, waitlist
invoices / invoice_items -- rentals, programs, fees
payments                 -- Stripe + offline (cash/check) unified
ledger_entries           -- double-entry; source of truth for balances/reports
forms / form_submissions -- waivers; signed PDF to Storage; link to registrations
check_ins                -- door scans: fob/QR/kiosk/POS; allow/deny/flag + reason
staff / shifts
messages / message_log   -- email/SMS sends with open tracking
```

Domain rules:
- A booking is **confirmed** only with payment or an approved hold. Holds carry
  `expires_at`; an expired unpaid hold releases automatically and notifies staff.
- Check-in engine: deny unknown credentials; admit-but-**flag** members with
  past-due balance (configurable threshold) and notify front desk; roster
  check-ins for programs (kiosk, batch).
- Setup/teardown buffers are part of the booking window for conflict purposes,
  rendered as distinct segments.
- Client balance = ledger sum, never a mutable column.

## Build phases

- **Phase 1 (internal tool first):** schema + RLS, facilities, booking types,
  price schedules, the Board (day/week calendar), clients read-only, seed data.
- **Phase 2:** Stripe — membership plans/subscriptions, rental invoices,
  offline payments, ledger, client balances. Public store: membership signup.
- **Phase 3:** programs/registrations + waivers, POS, check-in/door integration,
  communications, reports (live SQL views, not canned exports).
- **Migration:** export Amilia clients, active memberships, and outstanding
  balances; import scripts with dry-run mode; run parallel one billing cycle.

---

# DESIGN SYSTEM

**Set `ACTIVE_STYLE` below before building any UI. All five are fully
specified; implement ONLY the active one. Never mix styles unless told.**

```
ACTIVE_STYLE: <to be set — one of: arcade-night | broadcast | clubhouse |
              flight-ops | squareone-brand>
```

Shared rules regardless of style:
- Reference mockups live in `/design/mockups/` (the five approved HTML files).
  Match them closely — spacing, weight, and tone, not just colors.
- All numerals: `font-variant-numeric: tabular-nums`.
- `prefers-reduced-motion` disables all animation.
- Money renders from integer cents; negative/past-due always in the style's
  danger color.
- Zone data colors (used by every style for booking blocks, tuned per palette):
  Gym yellow · Gaming red · Dining green · Multiball blue · Adventure teal ·
  Billiards pink/magenta · Party Arcade orange.
- The signature dashboard component in every style is **the Board**: one lane
  per zone, 6 AM–11 PM, colored booking blocks, striped blocks = unpaid holds,
  a NOW line positioned from the real clock.

## Style 1 — `arcade-night`
Gaming floor after dark. Dark UI.
- Palette: void `#0b0716`, panel `#151024`, grid `#241b3e`, magenta `#ff3ec8`,
  cyan `#2fe6ff`, amber `#ffc432`, lime `#7dff5e`, red `#ff4d5e`,
  text `#e8e3ff`, dim `#8a80b8`.
- Type: **Press Start 2P** (labels/numbers, small sizes only) +
  **Chakra Petch** (body).
- Motifs: CRT scanline overlay, neon glow shadows, zones as arcade cabinets
  (lit = active, red = needs operator), revenue leaderboard, tasks as a quest
  log, blinking "insert coin" accents.
- Voice: playful operator ("PLAYERS INSIDE", "QUEST LOG", "ATTRACT MODE").

## Style 2 — `broadcast`
ESPN-style TV graphics package. Light UI.
- Palette: navy `#0e1b33`, sky `#eef2f8`, white `#f6f8fb`, red `#e0322b`,
  gold `#ffb61e`, steel `#5a6b87`, green `#159a4c`, line `#d6dde8`.
- Type: **Saira Condensed** italic 800/900 (display) + **Barlow** (body).
- Motifs: skewed/clip-path chyrons and lower-thirds, matchup cards for
  bookings ("TIPS OFF 5:00"), big gradient stat panels, scrolling bottom
  ticker ("S1 WIRE"), angled pills.
- Voice: sports desk ("GAMEDAY", "TURNOVERS", "PLAY-BY-PLAY", "RED ZONE").

## Style 3 — `clubhouse`
Warm members-club hospitality. Light UI.
- Palette: pine `#173229`, ivory `#f8f6f0`, card `#fffdf8`, brass `#b98a2e`,
  brass-light `#d9b968`, sage `#7d9187`, text `#22302b`, muted `#6f7d76`,
  hairline `#e3ded2`, rose `#b04a3a`.
- Type: **Cormorant Garamond** (display, italic accents) + **Karla** (body).
- Motifs: engraved hairline rules with ❖ finials, dotted-leader menu lines
  ("this evening's programme"), brass keylines, circular crest icons,
  generous whitespace.
- Voice: gracious concierge ("guest book", "matters for the concierge",
  "owing to the house").

## Style 4 — `flight-ops`
Mission control on graph paper. Light UI, maximum density.
- Palette: paper `#fbfbf8`, grid `#e6e6df`, ink `#1a1c1e`, muted `#71757c`,
  blue `#0b5fd9`, orange `#e8590c`, green `#0f7b3f`, red `#d21f2c`,
  amber `#b7791f`, wash `#f2f2ec`.
- Type: **IBM Plex Mono** (all data/labels) + **IBM Plex Sans** (prose).
- Motifs: visible graph-paper grid background, dark system-status strip
  (SYS · DOORS · STRIPE · RETRY QUEUE), booking manifest table with IDs +
  inline mini-timelines, instrument gauges with floating tags, P1/P2/P3
  severity queue, telemetry-style door log, timestamps as `16:42:07`.
- Voice: terse ops ("BK-2235 · NO DEPOSIT · HOLD→17:00", "ALL NOMINAL").

## Style 5 — `squareone-brand`
The org's own identity — flows with squareonecompassion.com. Light UI.
- Palette: navy `#182740`, blue `#2f6db8`, blue-light `#5b93d6`,
  sky `#eef4fb`, cloud `#f8fafd`, line `#dbe4f0`, text `#1f2c42`,
  muted `#64748c`, gold `#e8a13a`, green `#2e8b57`, red `#cf4436`.
  (Anchored to the SquareOne Interactive logo; confirm final hexes against
  the live site before locking.)
- Type: **Montserrat** 700/800 (display) + **Nunito Sans** (body).
- Motifs: **the square as design system** — CSS-drawn nested-square logo
  mark, square section markers, square corner accents on tiles, ghosted
  rotated-square texture in hero banners; rounded 14px cards; soft
  navy shadows; ecosystem strip echoing the public site nav (Early Learning
  Center · Interactive · Medical Center · Event Rooms · Donate); navy footer
  reading "part of SquareOne Compassion".
- Voice: warm and human ("Good afternoon — busy evening ahead", "Needs a
  person", "At the doors"). Community org, not SaaS.

---

## UI content standards (all styles)

- Front-desk queue shows only items needing a human, each with one clear
  action; urgency levels: urgent / soon / idea (or the style's equivalent).
- Door log entries: time, who, membership context, entry point + method,
  and outcome (in / denied / flagged with reason).
- Holds are visually unmistakable (striped/dashed) and always show their
  deadline and what's missing (deposit, confirmation).
- Every screen renders sanely at 380px wide.
- Demo/seed data must be plausible but clearly marked "placeholder data"
  in the footer until real data flows.
