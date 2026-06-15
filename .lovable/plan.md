# Payments Health + Full Payment Actions

This is a large scope. Plan groups it into 4 shippable phases so you can review each before the next. I'll implement phase 1 immediately on approval, then proceed phase by phase (or all at once if you say "do it all").

## Phase 1 — System Health: QuickBooks Payments card + Test Charge

**File:** `src/routes/_authenticated/settings.system-health.tsx` + new server fn in `src/lib/intuit.functions.ts`.

- New card "QuickBooks Payments".
- Reads existing `getIntuitStatus`.
  - Not connected → grey "Not Connected" badge, copy + link button to `/settings/quickbooks`. No test charge UI.
  - Connected → run checks in a new `runPaymentsHealthCheck` server fn:
    1. Token not expired (from status).
    2. `GET /quickbooks/v4/payments/echo` (or `/charges?count=1`) via `paymentsFetchWithMeta` → API reachable + merchant active.
    3. Tokenization endpoint reachability (HEAD on Intuit tokenization JS bundle URL).
  - Green or specific red message per failed check.
- Test charge subsection (connected only):
  - Amber warning banner.
  - Inputs: card number, MM/YY, CVV, zip, amount (default $1.00, min $1, max $5).
  - Uses existing Intuit tokenization (same flow as `tokenize-card.ts`) → calls a new server route `/api/intuit/test-charge` that charges + immediately refunds in one handler, returns both ids. Marks `payment_transactions` rows with `is_test=true` (new column) so they're excluded from bank register and totals.
  - Writes audit log entries via existing `audit_logs`.

**Migration:** add `is_test boolean default false` to `payment_transactions`; bank-register query filters it out.

## Phase 2 — Payment status model + badges

**Migration:**
- Extend `payments.status` allowed values: `completed`, `pending`, `voided`, `refunded`, `partially_refunded`, `disputed`, `lost`, `failed`.
- Add columns to `payments`: `voided_at`, `voided_by`, `void_reason`, `refunded_amount_cents`, `refund_reason`, `dispute_opened_at`, `dispute_reason`, `dispute_amount_cents`, `dispute_deadline`, `dispute_notes`, `dispute_outcome`.
- New table `payment_actions` (audit trail per payment): `payment_id`, `action` (charge/void/refund/partial_refund/dispute_opened/dispute_won/dispute_lost), `amount_cents`, `reason`, `notes`, `performed_by`, `intuit_tid`, `created_at`. RLS: staff read all, admin write. GRANT to authenticated + service_role.

**Shared:** `src/components/payment-status-badge.tsx` with all 8 states (colors per spec, struck-through for voided, amount shown for partial).

## Phase 3 — Void / Refund / Partial Refund actions

**Server routes** (all require admin + reauth OTP + Turnstile, mirroring `charge-card.ts`):
- `POST /api/intuit/void` — same-day, unsettled card payments only. Calls QBO void API.
- Extend existing `POST /api/intuit/refund` to accept `reason` + `notes` and write `payment_actions`.
- `POST /api/payments/manual-void` and `/api/payments/manual-refund` for cash/check (status update + audit only, no API).

Each action:
- Updates payment status + amounts.
- Inserts `payment_actions` row.
- Sends client SMS + email via existing messaging/email queue (templates with the exact copy you specified).
- Writes audit log.

**UI:**
- `src/components/payment-actions-menu.tsx` reusable dropdown — added to payment rows in `src/routes/_authenticated/payments.tsx` and on client profiles.
- Modals: `VoidPaymentDialog`, `RefundPaymentDialog` (full/partial in one dialog with mode toggle), with reauth-OTP gate using existing `verification` flow.
- When QBO not connected: card payments show buttons but clicking opens "QuickBooks Payments is not connected…" toast with link. Cash/check refunds show the manual-refund note.

**Email templates:** add `payment-voided.tsx`, `payment-refunded.tsx` in `src/lib/email-templates/` (registered in `registry.ts`). SMS via existing `messaging.functions.ts`.

## Phase 4 — Disputes + Detail view + Bank register

- `MarkDisputedDialog` (date, reason, amount, deadline, notes) + `ResolveDisputeDialog` (Won/Lost).
- Admin email on dispute opened (uses existing email queue + new `dispute-opened.tsx` admin template).
- Dashboard widget: "Open disputes" list with deadline (added to `src/routes/_authenticated/index.tsx`).
- Payment detail view: new route `src/routes/_authenticated/payments.$id.tsx` showing charge details, current status badge, `payment_actions` history, QBO TIDs, related notifications (joined from `notification_log` by `payment_id` metadata), audit entries.
- Bank register (`src/routes/_authenticated/payments.tsx` register section): apply the rules per spec — strike-through voids, negative entries for refunds, amber-held disputed amounts excluded until resolved, lost = negative entry, test charges hidden entirely.

## Notes / assumptions
- "Admin reauthentication OTP" reuses the existing `verification` system (`verification_challenges` / `verified_sessions`) — same as other sensitive actions.
- Client SMS uses existing Twilio integration; email uses the existing transactional queue.
- "QuickBooks Payments void API" — Intuit's Payments API only supports voiding unsettled auths via a refund on a captured-but-unsettled charge or `DELETE /charges/{id}` for auth-only. For captured-same-day charges QBO actually issues a same-day refund that nets to zero; UI labels it "Void" per your spec but server picks the correct API call.
- Health check #4 (tokenization reachability) is a HEAD to Intuit's JS bundle — there's no public "ping" endpoint.

## Suggested first ship
**Phase 1 only**, so you can see the health card + test-charge round-trip working before we commit to the bigger schema changes in phases 2–4. Reply "phase 1" to ship just that, or "all" to proceed straight through.
