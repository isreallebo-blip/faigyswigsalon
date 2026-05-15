# Client Portal

A client-facing portal completely separate from the staff CRM, at `/portal`. Clients sign up themselves (email or SMS), get auto-matched to an existing client profile (or a new one is created), and see a read-only view of their data.

## Database changes

Add the link between Supabase auth users and client profiles, plus a "self-registered" flag.

- `clients`:
  - `auth_user_id uuid UNIQUE NULL` — links a portal user to their client row
  - `self_registered boolean NOT NULL DEFAULT false`
  - `self_registered_acknowledged boolean NOT NULL DEFAULT false` — drives the staff "new self-registration" banner
- `audit_logs`: reuse existing table; add a new module value `'portal'` (no schema change, `module` is text).
- Trigger `handle_new_portal_user`: on `auth.users` insert, if `raw_user_meta_data->>'portal' = 'true'`, find a matching `clients` row by email or phone:
  - match found → set `clients.auth_user_id = new.id`
  - no match → insert a new `clients` row with `auth_user_id`, `email`/`phone` from auth user, `self_registered = true`. The existing `display_id` default assigns CLT-XXXXXX automatically.
- Skip the existing `handle_new_user` profile insert for portal users (check the same metadata flag) so portal clients don't get staff `profiles` rows.

### RLS — portal scoping

Add additive policies so a portal user (authenticated, no staff role) sees only their own data. Staff policies stay as-is.

Helper: `public.current_client_id()` SECURITY DEFINER, returns `clients.id` where `auth_user_id = auth.uid()`.

New SELECT policies (existing `auth read X` policies remain — staff continue full access; portal users will only match if their `client_id` resolves):

We'll instead **tighten** the existing `auth read X` policies to: `is_staff(auth.uid()) OR <portal scope>`, where:
- `clients`: `id = current_client_id()`
- `appointments`, `payments`, `service_workflows`, `custom_orders`, `repairs`: `client_id = current_client_id()`
- `wigs`: `id IN (select wig_id from service_workflows where client_id = current_client_id()) OR id IN (select wig_id from repairs where client_id = current_client_id()) OR reserved_for_client_id = current_client_id()`
- `workflow_steps`: `workflow_id IN (select id from service_workflows where client_id = current_client_id())`

`is_staff(uid)` = `EXISTS (select 1 from profiles where id = uid)`. All current staff have a profile row; portal clients won't.

Portal users get UPDATE on `clients` only for their own row, limited to name/email/phone/photo (enforced in the server function, not the policy).

## Server functions (createServerFn)

All under `src/lib/portal/*.functions.ts`, protected by `requireSupabaseAuth`.

- `getPortalDashboard` — next appt, repairs in progress, outstanding balance, total visits
- `getPortalAppointments`
- `getPortalWigs` — maps internal status to client-friendly label server-side
- `getPortalRepairs` — strips vendor name/company, returns "our repair partner"
- `getPortalPayments` — list + running total + outstanding balance
- `getPortalProfile` / `updatePortalProfile` — name/email/phone/photo only
- `acknowledgeSelfRegistrations` (staff) — clears the banner
- `getSelfRegisteredCount` (staff) — for the CRM banner

Each function logs to `audit_logs` with `module='portal'`.

## Routes

Public:
- `src/routes/portal.tsx` — pathless layout shell with portal theme + bottom nav
- `src/routes/portal/login.tsx` — email or phone tab; sends OTP via Supabase `signInWithOtp` (email) and Twilio-backed `signInWithOtp` (phone). Sets `options.data = { portal: true }` on signup.
- `src/routes/portal/verify.tsx` — enter 6-digit code
- `src/routes/_portal.tsx` — gated layout (`beforeLoad` checks session + that `current_client_id()` resolves; otherwise redirect to `/portal/login`)
- `src/routes/_portal/index.tsx` — Dashboard
- `src/routes/_portal/appointments.tsx`
- `src/routes/_portal/wigs.tsx`
- `src/routes/_portal/repairs.tsx`
- `src/routes/_portal/payments.tsx`
- `src/routes/_portal/profile.tsx`

Staff CRM gets a small `<SelfRegisteredBanner />` on the clients page.

## Twilio (SMS OTP)

Phone OTP requires Supabase Auth's Phone provider configured with Twilio. Use `supabase--configure_auth` is not enough — phone provider needs Twilio creds set in the Supabase Auth Phone provider settings. I'll request the Twilio Account SID, Auth Token, and Messaging Service SID via `add_secret` and wire them.

If the user prefers, we can ship email-only first and add SMS after Twilio creds are in.

## Design

Separate theme scoped to `/portal/*` via a CSS class on the portal root: cream `oklch(0.97 0.02 80)`, gold `oklch(0.75 0.13 75)`, soft black `oklch(0.20 0.01 60)`. Serif headings (Cormorant), clean sans body (Karla). Mobile-first, bottom tab bar, no sidebar. Hebcal via `@hebcal/core` (already pure JS, Worker-safe).

## Out of scope (per spec)

- Online booking, online payments
- Vendor names visible to clients
- Editing measurements/notes from portal

## Confirmations needed

1. **SMS via Twilio**: ship email-first now, add SMS after you provide Twilio creds — OK?
2. **Tightening existing RLS**: I'll modify the current `auth read X` policies to `is_staff(uid) OR <portal scope>`. Staff access is unchanged. Confirm OK to touch existing policies.