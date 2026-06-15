
-- Status enum for payments
DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('completed','pending','voided','refunded','partially_refunded','disputed','lost','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS status public.payment_status NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS refunded_amount_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_reason text,
  ADD COLUMN IF NOT EXISTS dispute_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_reason text,
  ADD COLUMN IF NOT EXISTS dispute_amount_cents integer,
  ADD COLUMN IF NOT EXISTS dispute_deadline date,
  ADD COLUMN IF NOT EXISTS dispute_notes text,
  ADD COLUMN IF NOT EXISTS dispute_outcome text;

-- Back-fill: voided rows get 'voided' status
UPDATE public.payments SET status = 'voided' WHERE voided_at IS NOT NULL AND status = 'completed';

-- Mark test charges
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

-- Action audit table
CREATE TABLE IF NOT EXISTS public.payment_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid REFERENCES public.payments(id) ON DELETE CASCADE,
  payment_transaction_id uuid REFERENCES public.payment_transactions(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('charge','void','refund','partial_refund','dispute_opened','dispute_won','dispute_lost','manual_void','manual_refund')),
  amount_cents integer,
  reason text,
  notes text,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  intuit_tid text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_actions_payment_id_idx ON public.payment_actions(payment_id);
CREATE INDEX IF NOT EXISTS payment_actions_payment_transaction_id_idx ON public.payment_actions(payment_transaction_id);
CREATE INDEX IF NOT EXISTS payment_actions_created_at_idx ON public.payment_actions(created_at DESC);

GRANT SELECT, INSERT ON public.payment_actions TO authenticated;
GRANT ALL ON public.payment_actions TO service_role;

ALTER TABLE public.payment_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read payment actions" ON public.payment_actions
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE POLICY "Admins write payment actions" ON public.payment_actions
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
