
# Client Messaging Inbox

Builds on the existing notification engine (Twilio + Resend already wired). Adds two-way messaging — clients reply to SMS/email and threads land in a CRM inbox; clients can also start threads from the portal.

## 1. Database

New tables (migration):

- **`conversations`**
  - `client_id` (FK), `subject` (text, nullable — for email threads)
  - `status` enum: `unread | read | replied | resolved`
  - `last_message_at`, `last_message_preview` (denormalized for inbox feed)
  - `assigned_to` (uuid → profiles, nullable)
  - `auto_reply_sent_at` (for 24h dedupe)

- **`messages`**
  - `conversation_id` (FK), `client_id` (denormalized for RLS speed)
  - `direction` enum: `inbound | outbound`
  - `channel` enum: `sms | email | portal | internal_note`
  - `body` (text), `subject` (text, email only)
  - `sender_user_id` (staff who sent) / null for client/system
  - `provider_message_id` (Twilio SID / Resend id / inbound email message-id)
  - `delivery_status` enum: `queued | sent | delivered | read | failed`
  - `read_by_staff_at`, `read_by_client_at`
  - `metadata` jsonb

- **`broadcasts`**
  - `sent_by` (uuid), `channel` enum, `body`, `email_subject`
  - `recipient_filter` jsonb, `recipient_count` int
  - `sent_count`, `delivered_count`, `failed_count`
  - timestamps

- **`broadcast_recipients`** — per-client delivery row (status, message_id, error)

- **`messaging_settings`** — single-row table:
  - `business_hours` jsonb (per-day open/close), `timezone`
  - `auto_reply_enabled`, `auto_reply_body`
  - `default_reply_channel` enum
  - `default_assignee` (uuid)

RLS:
- Staff: full read/write on all tables.
- Portal client: read/insert own `conversations` + `messages` (only `channel='portal'` outbound from client side, never `internal_note`). Cannot see `internal_note` rows.
- `audit_logs` already covers all writes.

Indexes: `messages(conversation_id, created_at)`, `conversations(status, last_message_at desc)`, `conversations(client_id)`.

## 2. Inbound webhooks (server routes under `/api/public/`)

- **`/api/public/hooks/twilio-inbound`** (POST)
  - Verify Twilio signature (`X-Twilio-Signature` HMAC-SHA1 with auth token).
  - Match `From` phone → `clients.phone`. If no match → log to a `messages` row with `client_id=null` (unmatched bucket) — staff can later link.
  - If body is `STOP`/`START`/`UNSUB` → toggle `clients.sms_opt_in` (already implemented STOP path; extend with START to re-enable).
  - Otherwise create/find open conversation (most recent non-resolved for client) → insert inbound message → set `conversations.status='unread'`, bump `last_message_*`.
  - Trigger auto-reply if outside business hours and not already sent in last 24h.
  - Notify staff (see §6).

- **`/api/public/hooks/resend-inbound`** (POST)
  - Resend Inbound Emails webhook. Verify svix signature.
  - Parse `In-Reply-To` / `References` headers → match to existing `messages.provider_message_id` to find conversation.
  - Otherwise match by `from` email → client; new conversation.
  - Insert inbound message, same flow as SMS.

- **`/api/public/hooks/twilio-status`** (POST) — delivery status callbacks → update `messages.delivery_status`.
- **`/api/public/hooks/resend-events`** (POST) — `email.delivered`, `email.opened`, `email.bounced` → update status.

Reply-To strategy for email: outbound notification emails set `Reply-To: inbox+<conversation_id>@notify.faigyswigsalon.com` so replies route correctly even without threading headers.

## 3. Server functions (`src/lib/inbox.functions.ts`)

- `listConversations({ filter, search, dateRange })` — staff inbox feed
- `getConversation(id)` — messages + client + assignment
- `sendStaffReply({ conversationId, body, channel })` — sends via Twilio/Resend, logs to `notification_log` + `messages`, marks conversation `replied`
- `addInternalNote({ conversationId, body })`
- `assignConversation({ conversationId, userId })`
- `markResolved(id)` / `markRead(id)`
- `sendQuickMessage({ clientId, body, channel })` — from client profile
- `sendPortalMessage({ body })` (uses `requireSupabaseAuth` → `current_client_id()`) — creates inbound `channel='portal'` message
- `listPortalMessages()` — client's own thread
- `sendBroadcast({ filter, channel, body, emailSubject })` — resolves recipients, enqueues sends, logs `broadcasts` + `broadcast_recipients`
- `previewBroadcastRecipients(filter)` — returns count + sample names
- `getMessagingSettings()` / `updateMessagingSettings(...)`

All staff functions check `is_staff(auth.uid())`. All writes call `logAudit(...)`.

## 4. Staff UI

- **Sidebar**: new "Inbox" icon with unread badge (Realtime subscription on `conversations` count where status='unread').
- **`/inbox`** — split layout:
  - Left: conversation list with filters (All/Unread/Replied/Resolved, SMS/Email, date, search).
  - Right: thread view — message bubbles (inbound left, outbound right, internal notes amber bg with "Internal note" tag), Hebrew date below each.
  - Reply composer: textarea, channel toggle (SMS/Email default = match last inbound), SMS char counter (160 segments warning), Send, "Add internal note" toggle, "Mark resolved", "Assign to" dropdown.
- **Client profile** — new "Message" button → modal compose (channel toggle, body) → calls `sendQuickMessage`.
- **Client profile "Messages" tab** — shows that client's conversation thread inline.
- **`/settings/messaging`** — business hours editor (per-day), auto-reply text, default channel, default assignee, displayed Twilio number.
- **`/settings/broadcasts`** — compose form: recipient filter (radio: all active / search-multi-select / has-upcoming-appt / outstanding-balance / wigs-in-repair), channel, body with variable chips, preview pane, "Send to N clients — confirm?" dialog, post-send delivery report.

## 5. Portal UI

- **`/portal/messages`** — chat-style thread (messages where `channel != 'internal_note'`), composer at bottom, "Delivered/Read" indicators, Realtime subscription for new staff replies.
- New "Messages" link in portal nav with unread badge.

## 6. Notifications to staff

- On new inbound message:
  - Realtime push updates badge instantly.
  - Email all admins (and assigned staff, if any) via existing `sendNotification` engine using a new system template `inbox_new_message` (admin-only — bypasses client opt-in checks since recipients are staff). Subject: `New message from [Client Name]`. Body includes preview + link to `/inbox/<id>`.

## 7. Audit

Every send (staff reply, internal note, broadcast, assignment, status change, settings update) calls `logAudit({ module: 'inbox', action, summary, before, after })`. `audit_logs` is already append-only (no DELETE/UPDATE policies) — logs are immutable for everyone including admins.

## 8. Secrets / config needed

All already in place:
- ✅ `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- ✅ `RESEND_API_KEY`, `RESEND_FROM_EMAIL`

User-side configuration after build (one-time, in Twilio + Resend dashboards):
- Twilio phone number → set inbound SMS webhook to `https://faigyswigsalon.lovable.app/api/public/hooks/twilio-inbound` and status callback to `/api/public/hooks/twilio-status`.
- Resend → enable Inbound Emails on `notify.faigyswigsalon.com` MX, route to `/api/public/hooks/resend-inbound`. Add webhook for delivery events to `/api/public/hooks/resend-events`.

I'll print the exact URLs + setup steps after deployment.

## 9. Build order (to keep diffs reviewable)

1. Migration (tables + RLS + indexes + seed default `messaging_settings` row).
2. Server functions (`inbox.functions.ts`, `broadcast.functions.ts`, `messaging-settings.functions.ts`).
3. Inbound webhooks (Twilio + Resend) with signature verification.
4. Outbound delivery status webhooks.
5. Staff inbox UI + sidebar badge + Realtime.
6. Client profile Message button + Messages tab.
7. Settings → Messaging + Broadcasts pages.
8. Portal Messages tab + Realtime.
9. Wire `Reply-To: inbox+<id>@...` into existing outbound email sender.
10. Hook auto-reply + admin email-on-inbound into webhook handlers.

Approve and I'll ship it in order — starting with the migration.
