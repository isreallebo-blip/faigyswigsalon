## Client Portal Access Management

A large feature. I'll build it in clear layers: schema → server functions → UI on client profile (card + tab) → admin settings page → list indicator.

### 1. Database migration

Add fields to `clients` for portal lifecycle state:
- `portal_status` enum: `not_signed_up | active | locked | disabled | pending_verification`
- `portal_locked_at`, `portal_locked_by`, `portal_lock_reason` (text)
- `portal_disabled_at`, `portal_disabled_by`
- `portal_invite_sent_at`, `portal_invite_sent_by`
- `portal_failed_login_count` int default 0
- `portal_last_failed_login_at`
- `portal_signup_method` text (`email`/`phone`)
- `portal_signup_at`, `portal_last_login_at`

New table `portal_activity_log` (append-only):
- `client_id`, `actor` (`client`/`staff`/`system`), `actor_user_id`, `actor_name`, `event_type`, `summary`, `ip_address`, `metadata jsonb`, `created_at`
- RLS: staff read all; client reads own (via `current_client_id()`); insert via service role.

Trigger to derive `portal_status` is overkill — manage in server fns.

### 2. Server functions — `src/lib/portal-admin.functions.ts`

All `requireSupabaseAuth` + staff check:
- `getClientPortalAccess(clientId)` → status, signup date/method, last login, masked email/phone, active session count, recent activity preview
- `sendPortalInvite(clientId)` — sends SMS/email via existing notification pipeline, stamps `portal_invite_sent_at`, logs
- `sendPortalPasswordReset(clientId)` — uses `supabaseAdmin.auth.admin.generateLink({ type: 'recovery' })` and queues email
- `lockClientPortal(clientId, reason)` — sets `banned_until` (far future) via admin API + status=locked; logs; notifies client
- `unlockClientPortal(clientId)` — clears ban; resets failed count; notifies client
- `disableClientPortal(clientId)` — bans permanently, status=disabled, notifies
- `enableClientPortal(clientId)` — restores
- `signOutAllPortalDevices(clientId)` — `supabaseAdmin.auth.admin.signOut(userId, 'global')`, notifies
- `getClientPortalActivity(clientId)` — full log
- `listPortalAccounts({ status, search })` — admin list with stats
- `bulkPortalAction({ clientIds, action, reason? })` — invite/lock/disable
- `recordPortalLoginAttempt({ clientId, success, ip })` — called from portal login flow; increments failed count; auto-locks at 5

Hook into existing portal login (`src/routes/portal.login.tsx`) to call `recordPortalLoginAttempt` and block if locked/disabled with the specified user-facing messages.

### 3. UI on client profile (`src/routes/_authenticated/clients.tsx`)

The clients page is currently a list; client details are likely shown in a drawer/modal. I'll:
- Add a **Portal Access** card component (`src/components/clients/PortalAccessCard.tsx`) — status badge, signup info, last login, masked contacts, action buttons (conditional on status)
- Add a **Portal Access** tab (`src/components/clients/PortalAccessTab.tsx`) — full activity log table
- Lock/disable use confirmation dialogs with reason dropdown

### 4. Client list indicator

Add a small colored dot next to client name in the list (green=active, grey=none, red=locked/disabled). Source from `clients.portal_status`.

### 5. Settings → Client Portal page

New route `src/routes/_authenticated/settings.client-portal.tsx`:
- Admin-only (use `is_admin`)
- Table: name / CLT ID / status / signup date / last login / signup method / actions
- Filters: All / Active / Locked / Disabled / Pending / Never logged in
- Bulk actions (invite, lock, disable)
- Search by name/email/phone/CLT ID
- CSV export button
- Add link in `settings.index.tsx`

### 6. Audit logging

Every action writes to both `portal_activity_log` (client-facing portal log) and existing `audit_logs` (global staff audit) via existing `logAudit` helper.

### Technical details
- Status is derived in `getClientPortalAccess`: no `auth_user_id` → `not_signed_up`; banned_until>now → `locked` or `disabled` (based on our `portal_status` column); email/phone unconfirmed → `pending_verification`; else `active`.
- Use `supabaseAdmin.auth.admin.updateUserById` for ban/unban (`ban_duration: '876000h'` for lock, `'none'` for unlock).
- Notifications reuse the existing template + queue system (insert into `notification_log` with `template_key='portal_*'`).
- Masking helpers in `src/lib/portal-admin.functions.ts` (e.g., `j***@gmail.com`, `+1 (***) ***-1234`).

### Out of scope
- No new email templates designed — uses inline plain-text bodies via existing SMS/email send helpers
- "Sensitive actions in portal" (viewed payments, changed email) already partially logged via existing `logPortalActivity` in `portal.functions.ts` — I'll route those into `portal_activity_log` too

Ready to build this. Approve to proceed.