# Reauthentication & Verification for Sensitive Actions

A 6-digit code (email or SMS) gates sensitive actions for both staff and client portal users. Successful verification unlocks sensitive actions for 15 minutes. 3 wrong attempts → 30-minute lockout + alert.

## 1. Database (one migration)

**`verification_challenges`**
- `id`, `user_id` (staff = auth.users.id, client = clients.id), `subject_type` ('staff'|'client')
- `purpose` ('reauth' | 'email_change' | 'phone_change')
- `channel` ('email'|'sms'), `destination_masked`
- `code_hash` (sha256), `expires_at` (now + 10min), `consumed_at`
- `attempts` (int, default 0), `created_at`, `ip_address`

**`verification_lockouts`**
- `id`, `user_id`, `subject_type`, `locked_until`, `reason`, `created_at`
- Unique partial index on active (locked_until > now()) rows

**`verified_sessions`** (15-min sliding unlock window)
- `id`, `user_id`, `subject_type`, `verified_at`, `expires_at` (verified_at + 15min)

**`pending_email_changes`**
- `id`, `user_id`, `new_email`, `confirm_token`, `expires_at`, `confirmed_at`

**`pending_phone_changes`**
- `id`, `user_id`, `subject_type`, `new_phone`, `code_hash`, `expires_at`, `confirmed_at`, `attempts`

RLS: users can read/insert their own rows; staff-side scoped via `auth.uid()`, client-side via `current_client_id()`.

Helper SQL functions: `is_user_locked(uid, subject)`, `is_verified(uid, subject)`, `consume_verification(...)`.

Admin "reset lockout" → server function deletes active lockouts, logs to `audit_logs`.

## 2. Server functions (new `src/lib/verification.functions.ts`)

- `requestVerificationCode({ purpose, channel? })` — picks channel based on what's on file, generates 6-digit code, hashes, stores, sends via existing `notifications/send.server` (email) or Twilio inbound module's send helper (SMS).
- `verifyCode({ challenge_id, code })` — checks expiry/attempts, increments on failure, on 3rd failure inserts lockout + fires alert email "Someone made multiple failed verification attempts".
- `getVerificationStatus()` — returns `{ verified_until, locked_until }`.
- `requestEmailChange({ new_email })` — requires `is_verified`; creates pending row, sends confirm link to new email, notice to old email.
- `confirmEmailChange({ token })` — public route handler `/api/public/confirm-email-change`.
- `requestPhoneChange({ new_phone })` — requires verified; sends SMS code to new number.
- `confirmPhoneChange({ code })` — confirms phone, updates profile/client.
- `changePasswordVerified({ new_password })` — requires verified; calls Supabase admin updateUserById; signs out other sessions (via `auth.admin.signOut(uid, 'others')`); sends confirmation.
- `adminResetLockout({ user_id })` — admin-only, audit-logged.

All log to `audit_logs` with `action = 'verified_action'` or `'verification_failed'` + IP from request headers.

## 3. UI

**Shared component** `src/components/verification-gate.tsx` — Dialog with:
- Channel picker (if both email + phone)
- "Send code" → 6 OTP boxes (uses existing `components/ui/input-otp.tsx`)
- Countdown timer, resend after 60s
- Inline error "Incorrect code, X attempts remaining"
- Lockout screen with "try again in 30 minutes"
- On success → calls `onVerified()` and shows the wrapped form

**Hook** `useVerifiedAction()` — checks `getVerificationStatus`; if verified, runs action directly; otherwise opens gate.

**Wiring points:**

Staff (`src/routes/_authenticated/profile.tsx`):
- Replace current-password fields with verification gate for: change password, change email, change phone (add phone change section).
- Password form: new password + confirm + strength indicator + requirements checklist.

Staff sensitive actions:
- Payments page: gate "View full details" + CSV export buttons.
- Audit log route: gate the page itself.
- Settings → Users: gate the page; gate role change, enable/disable, "Reset verification lockout" button (admin-only).
- Repairs/Inventory/Clients CSV export buttons (if present).
- Payments: gate "Void" button.

Client portal (`src/routes/portal.profile.tsx`):
- Gate change password, email, phone, view full payment history (`portal.payments.tsx`).

**Pending change banner** — small component on profile pages showing "Email change pending — check your new inbox".

## 4. Audit log

- Every code request, success, failure, lockout, admin reset → `audit_logs` row.
- Sensitive actions completed in verified window → existing audit insert + `metadata.verified = true`. Audit log UI renders a small "Verified" badge when `metadata.verified`.

## 5. Notifications

- Use existing `sendEmail` (Resend via notify.faigyswigsalon.com) and existing Twilio SMS helper.
- New templates inline in `verification.functions.ts`:
  - Code email/SMS ("Your verification code is 123456")
  - Failed-attempts alert email
  - Action-completed confirmation (password/email/phone changed)
  - Email-change notice to old address
  - Phone-change notice to old number

## 6. Out of scope / kept simple

- Reauth lockout is per-user, not per-action.
- Code length fixed 6 digits, numeric.
- IP address read from `cf-connecting-ip` / `x-forwarded-for` headers in server fns.
- No backup codes / TOTP — only email/SMS OTP as spec'd.

## Files touched

New:
- `supabase/migrations/<ts>_verification.sql`
- `src/lib/verification.functions.ts`
- `src/lib/verification.server.ts` (helpers: hash, generate, send)
- `src/components/verification-gate.tsx`
- `src/lib/use-verified-action.ts`
- `src/components/pending-change-banner.tsx`
- `src/routes/api/public/confirm-email-change.ts`

Edited:
- `src/routes/_authenticated/profile.tsx` (full rewrite of email/password sections; add phone change)
- `src/routes/_authenticated/settings.users.tsx` (gate + admin reset lockout button)
- `src/routes/_authenticated/settings.audit-log.tsx` (gate + verified badge rendering)
- `src/routes/_authenticated/payments.tsx` (gate void / full view / CSV)
- `src/routes/portal.profile.tsx` (gate + phone change UI)
- `src/routes/portal.payments.tsx` (gate full history)

Approve to proceed?
