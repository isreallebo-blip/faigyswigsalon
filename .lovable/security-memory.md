# Security Memory

## App context
Salon CRM with two distinct surfaces:
- **Staff/admin app** (under `/_authenticated/*`) — uses staff auth + RLS gated by `is_staff()` / `has_role()`.
- **Client portal** (under `/portal/*`) — uses Supabase auth for end clients, but virtually all portal data reads/writes go through `createServerFn` handlers that use `supabaseAdmin` (service role) AFTER scoping by `current_client_id()` / explicit ownership checks. Client-side direct table access via the publishable key is intentionally minimal.

## Scanner guidance — do not re-report
- **Underprovisioned RLS is not a vulnerability.** Do not flag tables/buckets that lack a portal-client SELECT/INSERT/UPDATE policy. The portal reads through admin-elevated server fns with ownership checks; missing client policies are intentional, not a misconfiguration. This explicitly covers: `payment_methods`, `payment_transactions`, `payments`, `intuit_connections`, storage buckets `client-photos` and `wig-photos`, and any future table whose access flows through server functions only.
- **Staff-only ALL policies are correct** for staff-managed resources (clients, wigs, repairs, vendors, bank_accounts, bank_transactions, audit_logs, notification_*, broadcasts, etc.). Do not suggest adding client policies unless the portal UI is later changed to query the table directly with the user JWT.
- **`/api/public/*` server routes** (twilio-inbound, twilio-status, resend-events, resend-inbound, process-broadcasts, send-reminders, confirm-email-change) are deliberately auth-bypassed for webhooks/cron. Each verifies its caller (HMAC/secret) inside the handler. Do not flag these as "open endpoints."
- **Twilio test in System Health** (`sendTestSms` / `sendTestEmail` server fns) is admin-gated via `has_role(... 'admin')`. Do not flag as unauthenticated.
- **`SUPABASE_PUBLISHABLE_KEY` in `.env` / `VITE_*` env vars** is the public anon key and safe to ship to the browser.

## Things that must never happen
- Never grant `anon` SELECT on `payment_*`, `intuit_connections`, `audit_logs`, `verification_*`, or `messaging_settings`.
- Never bypass HMAC/secret verification in `/api/public/*` webhooks.
- Never log or return Twilio Auth Token, Resend API key, Intuit secrets, or `SUPABASE_SERVICE_ROLE_KEY` from any handler.
- Never store user role on `profiles`; roles live exclusively in `user_roles` and are checked via `has_role()`.
