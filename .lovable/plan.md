# Intuit Production Compliance Update

## 1. Encrypt Intuit OAuth tokens (AES-256-GCM)

- **Secret:** new `INTUIT_TOKEN_ENCRYPTION_KEY` (32 bytes, base64). I'll prompt you to add it.
- **Storage format:** ciphertext written into existing `intuit_connections.access_token` / `refresh_token` (text columns) as `enc:v1:<iv_b64>:<tag_b64>:<ct_b64>`.
- **Helpers** in `src/lib/intuit.server.ts`:
  - `encryptToken(plain)` — AES-256-GCM with random 12-byte IV, returns the `enc:v1:…` envelope.
  - `decryptToken(stored)` — if value begins with `enc:v1:`, decrypt; otherwise return as plaintext (legacy fallback so existing rows keep working until next refresh).
- **Read path:** `loadConnection()` decrypts before returning.
- **Write path:** `upsertConnection`, `getValidConnection` (on refresh), and `forceRefreshConnection` encrypt before saving. Existing rows get migrated to ciphertext automatically the first time they're refreshed.
- **Decryption only at API-call time:** the token is decrypted inside `getValidConnection()` which is only called by `paymentsFetch()` and the test/refresh server fns.

## 2. Cloudflare Turnstile on payment workflows

- **Secrets:** `TURNSTILE_SECRET_KEY` (server) + `VITE_TURNSTILE_SITE_KEY` (public). I'll prompt you to add them.
- **Server helper:** `verifyTurnstile(token, remoteIp)` in `src/lib/intuit.server.ts` posts to `https://challenges.cloudflare.com/turnstile/v0/siteverify`. Throws on failure. If `TURNSTILE_SECRET_KEY` is unset it throws (fail-closed).
- **Wired into:**
  - `/api/intuit/tokenize-card` (saving a new card)
  - `/api/intuit/charge-card` (charging a saved card)
  - `/api/intuit/refund` (refunds)
  - server fns `saveTokenizedCard`, `chargeCard`, `refundCharge`
  Each now requires a `turnstileToken` field in its input.
- **UI component:** `<TurnstileWidget onToken={...} />` rendered in any card-collection / charge form. Loads `https://challenges.cloudflare.com/turnstile/v0/api.js` once.

## 3. Card data verification (compliance only — no code change needed)

- Schema audit confirms: `payment_methods` stores only `card_brand`, `last4`, `exp_month`, `exp_year`, `cardholder_name`, plus the Intuit `intuit_payment_method_id` token. No PAN, no CVV, no Track2.
- `payment_transactions` stores only `amount_cents`, `currency`, `status`, plus Intuit IDs.
- All charges route through `cardOnFile: { id: intuit_payment_method_id }` — i.e., the Intuit token, never raw card data.
- I'll add a `CHECK` constraint on `payment_methods.last4` (`~ '^\d{4}$'`) as a defense-in-depth signal and document the audit.

## 4. Receipts

- **New columns on `payment_transactions`:**
  - `receipt_token uuid unique default gen_random_uuid()` — opaque token for the public receipt URL
  - `receipt_email text`
  - `receipt_sent_at timestamptz`
  - `salon_name`, `salon_address`, `salon_phone` — snapshot on the transaction (configurable later).
- **Public receipt page** `/receipt/$token` — read-only summary (date, amount, last-4, brand, status, refunded amount, salon info). Uses a public server fn `getReceiptByToken({ token })` with `supabaseAdmin` that returns only safe display fields (no `intuit_charge_id`).
- **Email receipt** server fn `emailPaymentReceipt({ transactionId, email })` — admin-only, sends via Resend connector with a React Email template `payment-charge-receipt.tsx`, records `receipt_email` / `receipt_sent_at`.
- **Receipt UI block** appended to the existing QuickBooks settings page → "Recent charges" with a "Send receipt" action; receipt link copies to clipboard.

## 5. Intuit identifier audit (questionnaire answer)

- **`realm_id`** (intuit_connections): **required** — it's the QuickBooks company ID and is part of every Payments API URL (`/quickbooks/v4/customers/{realmId}/cards/...`). Cannot be removed.
- **`intuit_customer_id`** (payment_methods): currently set to the `realm_id` (used as the customer scope when vaulting). Required.
- **`intuit_payment_method_id`** / **`intuit_charge_id`** / **`intuit_refund_id`**: required to perform subsequent charges / refunds / reconciliation against the same Intuit record.
- **No Intuit *user* ID** is stored (we never call OpenID/userinfo). Only company/realm + payment-object IDs.

## 6. Compliance summary

After deploy I'll print a checklist:

```text
Token encryption ............ AES-256-GCM at rest (legacy rows migrate on next refresh)
CAPTCHA ..................... Cloudflare Turnstile on tokenize / charge / refund
Card data storage ........... None (PAN/CVV/Track2 never touch DB; Intuit tokens only)
Receipts .................... Public /receipt/$token page + email-receipt action
Intuit identifiers .......... realm_id + payment-object IDs only; no Intuit user ID
```

## Files to add / change

- **Migration** (one): `intuit_connections` no-op (semantic change), `payment_transactions` add receipt columns, `payment_methods` last4 CHECK.
- **`src/lib/intuit.server.ts`**: add encrypt/decrypt + verifyTurnstile, use in load/upsert/refresh.
- **`src/lib/intuit.functions.ts`**: require `turnstileToken`, call `verifyTurnstile`, add `emailPaymentReceipt`, `listRecentCharges`, `getReceiptByToken`.
- **`src/routes/api/intuit/*.ts`** (tokenize-card, charge-card, refund): validate `turnstileToken`.
- **`src/components/turnstile-widget.tsx`** (new).
- **`src/lib/email-templates/payment-charge-receipt.tsx`** (new) + registry entry.
- **`src/routes/receipt.$token.tsx`** (new, public).
- **`src/routes/_authenticated/settings.quickbooks.tsx`**: append "Recent charges" + receipt actions.

## Secrets I need you to add (via the secure form)

1. `INTUIT_TOKEN_ENCRYPTION_KEY` — 32 raw bytes base64-encoded (I'll show you `openssl rand -base64 32`).
2. `TURNSTILE_SECRET_KEY` — from Cloudflare Turnstile dashboard.
3. `VITE_TURNSTILE_SITE_KEY` — Turnstile site key (publishable, goes in `.env`).

Approve and I'll implement the migration first, then code, then prompt for the three secrets.
