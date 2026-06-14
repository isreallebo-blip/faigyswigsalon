CREATE TABLE public.intuit_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'intuit_payments' CHECK (provider = 'intuit_payments'),
  environment text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox', 'production')),
  realm_id text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_type text NOT NULL DEFAULT 'Bearer',
  scope text NOT NULL,
  access_token_expires_at timestamp with time zone NOT NULL,
  refresh_token_expires_at timestamp with time zone,
  connected_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (provider)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intuit_connections TO authenticated;
GRANT ALL ON public.intuit_connections TO service_role;
ALTER TABLE public.intuit_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage Intuit connection"
ON public.intuit_connections
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'intuit_payments' CHECK (provider = 'intuit_payments'),
  intuit_customer_id text,
  intuit_payment_method_id text NOT NULL,
  cardholder_name text,
  customer_email text,
  card_brand text,
  last4 text,
  exp_month integer CHECK (exp_month BETWEEN 1 AND 12),
  exp_year integer CHECK (exp_year >= 2000 AND exp_year <= 9999),
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (intuit_payment_method_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage payment methods"
ON public.payment_methods
FOR ALL
TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  payment_method_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'intuit_payments' CHECK (provider = 'intuit_payments'),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'USD',
  intuit_charge_id text,
  intuit_refund_id text,
  status text NOT NULL,
  description text,
  refunded_amount_cents integer NOT NULL DEFAULT 0 CHECK (refunded_amount_cents >= 0),
  error_message text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (intuit_charge_id),
  UNIQUE (intuit_refund_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_transactions TO authenticated;
GRANT ALL ON public.payment_transactions TO service_role;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage payment transactions"
ON public.payment_transactions
FOR ALL
TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

CREATE UNIQUE INDEX payment_methods_one_default_per_client_idx
ON public.payment_methods (client_id)
WHERE is_default;

CREATE INDEX payment_methods_client_id_idx ON public.payment_methods (client_id);
CREATE INDEX payment_transactions_client_id_idx ON public.payment_transactions (client_id);
CREATE INDEX payment_transactions_payment_method_id_idx ON public.payment_transactions (payment_method_id);

CREATE TRIGGER touch_intuit_connections_updated_at
BEFORE UPDATE ON public.intuit_connections
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER touch_payment_methods_updated_at
BEFORE UPDATE ON public.payment_methods
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER touch_payment_transactions_updated_at
BEFORE UPDATE ON public.payment_transactions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();