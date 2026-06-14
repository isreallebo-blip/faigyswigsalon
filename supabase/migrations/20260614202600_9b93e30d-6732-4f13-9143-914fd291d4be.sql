
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS receipt_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS receipt_email text,
  ADD COLUMN IF NOT EXISTS receipt_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS salon_name text,
  ADD COLUMN IF NOT EXISTS salon_address text,
  ADD COLUMN IF NOT EXISTS salon_phone text;

CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_receipt_token_key
  ON public.payment_transactions (receipt_token);

ALTER TABLE public.payment_methods
  DROP CONSTRAINT IF EXISTS payment_methods_last4_format_check;
ALTER TABLE public.payment_methods
  ADD CONSTRAINT payment_methods_last4_format_check
  CHECK (last4 IS NULL OR last4 ~ '^[0-9]{4}$');
