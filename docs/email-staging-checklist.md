# Staging Email Verification Checklist

End-to-end checklist for verifying templates, domain, and queue processing on staging before announcing email changes to users.

Run `bun run test` first — the unit tests must pass before any manual checks.

---

## 1. Domain & DNS

- [ ] In **Cloud → Emails → Manage Domains**, `notify.faigyswigsalon.com` shows status **Active** (green).
- [ ] SPF, DKIM, and MX records all show ✓ verified.
- [ ] No `provisioning_failed` banner.

## 2. Database Infrastructure

Run in the SQL editor:

```sql
-- Queues exist
SELECT queue_name FROM pgmq.list_queues()
 WHERE queue_name IN ('auth_emails','transactional_emails');
-- Cron job exists and is active
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'process-email-queue';
-- Rate-limit cooldown is not active
SELECT retry_after_until FROM email_send_state;
-- DLQ is empty (or expected size)
SELECT count(*) FROM pgmq.read('auth_emails_dlq', 0, 100);
SELECT count(*) FROM pgmq.read('transactional_emails_dlq', 0, 100);
```

- [ ] Both queues present.
- [ ] Cron job `process-email-queue` exists, active, running every minute.
- [ ] `retry_after_until` is `NULL` or in the past.
- [ ] DLQs empty (or known/triaged).

## 3. Auth Email Templates (live send)

Trigger from staging using a real inbox you control:

| Template | How to trigger | Expect |
| --- | --- | --- |
| Signup | Register a new client at `/portal.signup` | Branded "Verify Email" email, link works |
| Magic link | Use OTP login on `/login` | "Log In" CTA renders, link single-use |
| Recovery | "Forgot password" on `/login` | "Reset Password" CTA, lands on `/reset-password` |
| Invite | Settings → Users → Invite staff | "Accept Invitation" CTA, opens signup |
| Email change | Profile → change email | TWO emails: notice to OLD address, confirm to NEW. Body reads "from OLD to NEW" |
| Reauthentication | Verification gate on sensitive action | 6-digit code visible, expires in 10 min |

For each:
- [ ] Arrives in inbox (not spam) within 60s.
- [ ] From address is `…@notify.faigyswigsalon.com`.
- [ ] Subject + body match expected template.
- [ ] CTA link works and lands on the correct page.
- [ ] No raw `{{ .X }}` Go template placeholders visible.

## 4. Queue Processing

After triggering the sends above:

```sql
SELECT DISTINCT ON (message_id)
       template_name, recipient_email, status, error_message, created_at
  FROM email_send_log
 WHERE created_at > now() - interval '15 minutes'
 ORDER BY message_id, created_at DESC;
```

- [ ] Every triggered email shows `status = 'sent'`.
- [ ] No `failed`, `dlq`, or `suppressed` rows (unless intentional).
- [ ] `pending` rows clear within one cron cycle (~1 min).

## 5. Failure Modes (smoke)

- [ ] **Suppressed recipient**: add a test address to `suppressed_emails`, trigger a send to it, confirm it logs as `suppressed` and no email lands.
- [ ] **Bad template name**: call the send route with a non-existent template — returns a clean 4xx, nothing enqueued.
- [ ] **Rate limit recovery**: if `retry_after_until` is set during testing, confirm processing resumes after it elapses.

## 6. Application Triggers

Verified together with section 3:

- [ ] Confirm-email-change endpoint `/api/public/confirm-email-change` returns success for a real token and updates `auth.users.email`.
- [ ] Verification gate locks the account after 3 wrong codes for 30 min and sends a security-alert email.
- [ ] Admin "Reset verification lockout" clears the lockout and writes an audit-log entry.

## 7. Sign-off

- [ ] All checkboxes above ticked.
- [ ] Screenshots of one representative email saved to the release ticket.
- [ ] Tester + date recorded.

Tester: __________  Date: __________
