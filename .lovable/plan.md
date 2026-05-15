# Client Notifications — SMS (Twilio) + Email (Resend)

A complete notification system that sends both SMS and email to clients on key events, with admin-editable templates, per-client opt-in/out, automatic reminders, delivery logging, and STOP-keyword compliance.

## 1. Database

### `notification_templates`
Admin-editable templates (one row per type). Seeded with the 11 templates below.
- `key` (text, unique) — e.g. `appointment_confirmation`
- `label` (text) — e.g. "Appointment confirmation"
- `category` (text) — appointment / wig / payment / wash_set
- `enabled` (bool, default true) — global on/off
- `sms_body` (text) — with `[First Name]`, `[Date]`, etc. placeholders
- `email_subject` (text)
- `email_body` (text) — same placeholder set
- `send_email` (bool, default true), `send_sms` (bool, default true)

### `notification_log`
Every send attempt — one row per channel.
- `client_id`, `template_key`, `channel` ('sms' | 'email')
- `recipient` (phone or email), `subject`, `body`
- `status` ('sent' | 'delivered' | 'failed'), `error_message`
- `provider_message_id`, `metadata` (jsonb), `created_at`
- `idempotency_key` (text, unique nullable) — prevents double-sends

### `clients` — new columns
- `sms_opt_in` (bool, default true)
- `email_opt_in` (bool, default true)
- `outstanding_balance_reminded_at` (timestamptz)

### `appointments` — new column
- `last_notified_starts_at` (timestamptz) — to detect reschedules

### Seed data
Insert the 11 templates with the exact copy from the spec.

### RLS
- Templates: staff manages; portal users read enabled ones.
- Log: staff reads/writes; portal users read their own.

## 2. Server logic

### `src/lib/notifications/send.functions.ts`
Single core server function `sendNotification({ clientId, templateKey, vars, idempotencyKey? })`:
1. Loads template; bails if `enabled = false`.
2. Loads client; resolves channels by `template.send_*` AND `client.*_opt_in` AND contact-on-file (fallback rule: if only one method exists, use it even if the other is on).
3. Renders placeholders: `[First Name]`, `[Last Name]`, `[Date]`, `[Time]`, `[Amount]`, `[Hebrew Date]` (via `@hebcal/core`), `[CLT ID]`, `[Appointment Type]`.
4. SMS via Twilio gateway (appends `Reply STOP to unsubscribe`); Email via Resend gateway.
5. Inserts a `notification_log` row per channel with status + provider IDs + error.
6. Idempotency key prevents duplicates on retry.

### Trigger wiring (called from existing staff mutations)
- `appointments` insert → `appointment_confirmation`
- `appointments` update of `starts_at` → `appointment_rescheduled`
- `appointments` status → `cancelled` → `appointment_cancelled`
- `repairs` status → `sent_to_vendor` → `wig_sent_to_repair`
- `repairs` status → `returned` OR wig status → `ready_for_pickup` → `wig_ready_for_pickup`
- `custom_orders` set `received_date` → `custom_order_arrived`
- `payments` insert → `payment_received` (SMS) + `payment_receipt` (email-only formatted receipt)
- `service_workflows` wash & set drop-off step → `wash_set_dropoff`
- `service_workflows` wash & dry step complete → `wash_set_ready`

### Cron jobs (`/api/public/hooks/*` + pg_cron, every 15 min)
- `appointment-reminders-24h` — appointments with `starts_at` between now+23.5h and now+24.5h, no `reminder_24h_sent_at` → send + stamp.
- `appointment-reminders-2h` — same logic with 2h window + `reminder_2h_sent_at`.
- `outstanding-balance-reminder` — clients with positive balance older than 7 days and null `outstanding_balance_reminded_at` → send + stamp (one-shot).

### Twilio inbound webhook `/api/public/hooks/twilio-sms-inbound`
- Verifies Twilio signature.
- If body is `STOP` (case-insensitive), set `clients.sms_opt_in = false` for matching phone.

## 3. Portal UI

`portal.profile.tsx` — add **Notification preferences** card with two switches (SMS / Email). Disable the toggle that would result in both being off (must keep at least one on); show inline helper text.

## 4. Staff UI

### Client profile — new "Activity" tab
Lists `notification_log` rows: timestamp, type (label), channel icon, recipient, status badge (Sent / Delivered / Failed). Failed rows red; "Resend" button on each row.

### Client list — failure indicator
Red dot on a client row when they have a `failed` notification in the last 7 days.

### `Settings > Notifications` (admin only)
- Table of all 11 templates with toggle (enabled), edit drawer for SMS body / Email subject / Email body / per-channel toggles.
- Variable reference chip-row inside the editor.
- Live preview with a sample client.

## 5. Email receipt template

React Email template `payment-receipt.tsx` rendered for `payment_receipt`:
- Faigy's Wig Salon header
- Client name + CLT-XXXXXX
- Date + Hebrew date
- Amount, method, description
- Running balance OR "Paid in full"
- Thank-you footer

(All other emails reuse a simple branded shell — no full receipt formatting.)

## 6. Secrets needed

- `TWILIO_API_KEY` (Twilio connector) + `TWILIO_FROM_NUMBER`
- `RESEND_API_KEY` (Resend connector) + verified `notify.faigyswigsalon.com` sender
- `TWILIO_WEBHOOK_AUTH_TOKEN` for inbound STOP signature verification

I'll request these via the secrets tool right after you approve.

---

## Out of scope

- Replying to other inbound SMS (only STOP handled)
- Per-client custom templates
- Localization beyond English

Ready to build on approval.
