
-- Portal: link clients to auth users + self-registration tracking
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE,
  ADD COLUMN IF NOT EXISTS self_registered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS self_registered_acknowledged boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS clients_auth_user_id_idx ON public.clients(auth_user_id);

-- Helper: is the current auth user a staff member (has a profiles row)
CREATE OR REPLACE FUNCTION public.is_staff(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid)
$$;

-- Helper: resolve the client_id for the currently signed-in portal user
CREATE OR REPLACE FUNCTION public.current_client_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.clients WHERE auth_user_id = auth.uid() LIMIT 1
$$;

-- Patch handle_new_user so portal signups don't create a staff profile row
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_status public.user_status;
BEGIN
  IF (new.raw_user_meta_data->>'portal') = 'true' THEN
    RETURN new;
  END IF;

  v_status := CASE
    WHEN new.invited_at IS NOT NULL AND new.confirmed_at IS NULL THEN 'invited'::public.user_status
    ELSE 'active'::public.user_status
  END;

  INSERT INTO public.profiles (id, email, full_name, status)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email),
    v_status
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

-- Trigger function: handle portal signups -> auto-link or create client
CREATE OR REPLACE FUNCTION public.handle_new_portal_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_email text;
  v_phone text;
BEGIN
  IF (new.raw_user_meta_data->>'portal') IS DISTINCT FROM 'true' THEN
    RETURN new;
  END IF;

  v_email := lower(coalesce(new.email, ''));
  v_phone := coalesce(new.phone, new.raw_user_meta_data->>'phone', '');

  -- Try to match an existing client by email or phone
  SELECT id INTO v_client_id
  FROM public.clients
  WHERE auth_user_id IS NULL
    AND (
      (v_email <> '' AND lower(coalesce(email, '')) = v_email)
      OR (v_phone <> '' AND coalesce(phone, '') = v_phone)
    )
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_client_id IS NOT NULL THEN
    UPDATE public.clients
    SET auth_user_id = new.id, updated_at = now()
    WHERE id = v_client_id;
  ELSE
    INSERT INTO public.clients (auth_user_id, full_name, email, phone, self_registered)
    VALUES (
      new.id,
      COALESCE(NULLIF(new.raw_user_meta_data->>'full_name', ''), NULLIF(v_email, ''), NULLIF(v_phone, ''), 'New client'),
      NULLIF(v_email, ''),
      NULLIF(v_phone, ''),
      true
    );
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_portal ON auth.users;
CREATE TRIGGER on_auth_user_created_portal
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_portal_user();

-- Make sure the existing handle_new_user trigger exists too (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created' AND tgrelid = 'auth.users'::regclass
  ) THEN
    CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- ============================================================
-- Tighten existing read policies: staff keep full access,
-- portal users see only their own data.
-- ============================================================

-- clients
DROP POLICY IF EXISTS "auth read clients" ON public.clients;
CREATE POLICY "auth read clients" ON public.clients
FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()) OR id = public.current_client_id());

DROP POLICY IF EXISTS "auth update clients" ON public.clients;
CREATE POLICY "auth update clients" ON public.clients
FOR UPDATE TO authenticated
USING (public.is_staff(auth.uid()) OR id = public.current_client_id())
WITH CHECK (public.is_staff(auth.uid()) OR id = public.current_client_id());

DROP POLICY IF EXISTS "auth insert clients" ON public.clients;
CREATE POLICY "auth insert clients" ON public.clients
FOR INSERT TO authenticated
WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "auth delete clients" ON public.clients;
CREATE POLICY "auth delete clients" ON public.clients
FOR DELETE TO authenticated
USING (public.is_staff(auth.uid()));

-- appointments
DROP POLICY IF EXISTS "auth read appointments" ON public.appointments;
CREATE POLICY "auth read appointments" ON public.appointments
FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()) OR client_id = public.current_client_id());

DROP POLICY IF EXISTS "auth insert appointments" ON public.appointments;
CREATE POLICY "auth insert appointments" ON public.appointments
FOR INSERT TO authenticated
WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "auth update appointments" ON public.appointments;
CREATE POLICY "auth update appointments" ON public.appointments
FOR UPDATE TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "auth delete appointments" ON public.appointments;
CREATE POLICY "auth delete appointments" ON public.appointments
FOR DELETE TO authenticated
USING (public.is_staff(auth.uid()));

-- payments
DROP POLICY IF EXISTS "auth read payments" ON public.payments;
CREATE POLICY "auth read payments" ON public.payments
FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()) OR client_id = public.current_client_id());

DROP POLICY IF EXISTS "auth insert payments" ON public.payments;
CREATE POLICY "auth insert payments" ON public.payments
FOR INSERT TO authenticated
WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "auth update payments" ON public.payments;
CREATE POLICY "auth update payments" ON public.payments
FOR UPDATE TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "auth delete payments" ON public.payments;
CREATE POLICY "auth delete payments" ON public.payments
FOR DELETE TO authenticated
USING (public.is_staff(auth.uid()));

-- repairs
DROP POLICY IF EXISTS "auth read repairs" ON public.repairs;
CREATE POLICY "auth read repairs" ON public.repairs
FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()) OR client_id = public.current_client_id());

DROP POLICY IF EXISTS "auth insert repairs" ON public.repairs;
CREATE POLICY "auth insert repairs" ON public.repairs
FOR INSERT TO authenticated
WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "auth update repairs" ON public.repairs;
CREATE POLICY "auth update repairs" ON public.repairs
FOR UPDATE TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "auth delete repairs" ON public.repairs;
CREATE POLICY "auth delete repairs" ON public.repairs
FOR DELETE TO authenticated
USING (public.is_staff(auth.uid()));

-- service_workflows
DROP POLICY IF EXISTS "auth read service_workflows" ON public.service_workflows;
CREATE POLICY "auth read service_workflows" ON public.service_workflows
FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()) OR client_id = public.current_client_id());

DROP POLICY IF EXISTS "auth insert service_workflows" ON public.service_workflows;
CREATE POLICY "auth insert service_workflows" ON public.service_workflows
FOR INSERT TO authenticated
WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "auth update service_workflows" ON public.service_workflows;
CREATE POLICY "auth update service_workflows" ON public.service_workflows
FOR UPDATE TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "auth delete service_workflows" ON public.service_workflows;
CREATE POLICY "auth delete service_workflows" ON public.service_workflows
FOR DELETE TO authenticated
USING (public.is_staff(auth.uid()));

-- workflow_steps
DROP POLICY IF EXISTS "auth read workflow_steps" ON public.workflow_steps;
CREATE POLICY "auth read workflow_steps" ON public.workflow_steps
FOR SELECT TO authenticated
USING (
  public.is_staff(auth.uid())
  OR workflow_id IN (SELECT id FROM public.service_workflows WHERE client_id = public.current_client_id())
);

DROP POLICY IF EXISTS "auth insert workflow_steps" ON public.workflow_steps;
CREATE POLICY "auth insert workflow_steps" ON public.workflow_steps
FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "auth update workflow_steps" ON public.workflow_steps;
CREATE POLICY "auth update workflow_steps" ON public.workflow_steps
FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "auth delete workflow_steps" ON public.workflow_steps;
CREATE POLICY "auth delete workflow_steps" ON public.workflow_steps
FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

-- custom_orders
DROP POLICY IF EXISTS "auth read custom_orders" ON public.custom_orders;
CREATE POLICY "auth read custom_orders" ON public.custom_orders
FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()) OR client_id = public.current_client_id());

DROP POLICY IF EXISTS "auth insert custom_orders" ON public.custom_orders;
CREATE POLICY "auth insert custom_orders" ON public.custom_orders
FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "auth update custom_orders" ON public.custom_orders;
CREATE POLICY "auth update custom_orders" ON public.custom_orders
FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "auth delete custom_orders" ON public.custom_orders;
CREATE POLICY "auth delete custom_orders" ON public.custom_orders
FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

-- wigs (portal client sees wigs tied to their workflows / repairs / reservations)
DROP POLICY IF EXISTS "auth read wigs" ON public.wigs;
CREATE POLICY "auth read wigs" ON public.wigs
FOR SELECT TO authenticated
USING (
  public.is_staff(auth.uid())
  OR reserved_for_client_id = public.current_client_id()
  OR id IN (SELECT wig_id FROM public.service_workflows WHERE client_id = public.current_client_id() AND wig_id IS NOT NULL)
  OR id IN (SELECT wig_id FROM public.repairs WHERE client_id = public.current_client_id() AND wig_id IS NOT NULL)
);

DROP POLICY IF EXISTS "auth insert wigs" ON public.wigs;
CREATE POLICY "auth insert wigs" ON public.wigs
FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "auth update wigs" ON public.wigs;
CREATE POLICY "auth update wigs" ON public.wigs
FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "auth delete wigs" ON public.wigs;
CREATE POLICY "auth delete wigs" ON public.wigs
FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

-- vendors / bank_accounts / bank_transactions / activity_log -> staff only
DROP POLICY IF EXISTS "auth read vendors" ON public.vendors;
CREATE POLICY "auth read vendors" ON public.vendors
FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "auth insert vendors" ON public.vendors;
CREATE POLICY "auth insert vendors" ON public.vendors
FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "auth update vendors" ON public.vendors;
CREATE POLICY "auth update vendors" ON public.vendors
FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "auth delete vendors" ON public.vendors;
CREATE POLICY "auth delete vendors" ON public.vendors
FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "auth read bank_accounts" ON public.bank_accounts;
CREATE POLICY "auth read bank_accounts" ON public.bank_accounts
FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "auth insert bank_accounts" ON public.bank_accounts;
CREATE POLICY "auth insert bank_accounts" ON public.bank_accounts
FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "auth update bank_accounts" ON public.bank_accounts;
CREATE POLICY "auth update bank_accounts" ON public.bank_accounts
FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "auth delete bank_accounts" ON public.bank_accounts;
CREATE POLICY "auth delete bank_accounts" ON public.bank_accounts
FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "auth read bank_transactions" ON public.bank_transactions;
CREATE POLICY "auth read bank_transactions" ON public.bank_transactions
FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "auth insert bank_transactions" ON public.bank_transactions;
CREATE POLICY "auth insert bank_transactions" ON public.bank_transactions
FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "auth update bank_transactions" ON public.bank_transactions;
CREATE POLICY "auth update bank_transactions" ON public.bank_transactions
FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "auth delete bank_transactions" ON public.bank_transactions;
CREATE POLICY "auth delete bank_transactions" ON public.bank_transactions
FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "auth read activity_log" ON public.activity_log;
CREATE POLICY "auth read activity_log" ON public.activity_log
FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) OR client_id = public.current_client_id());
DROP POLICY IF EXISTS "auth insert activity_log" ON public.activity_log;
CREATE POLICY "auth insert activity_log" ON public.activity_log
FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth update activity_log" ON public.activity_log;
CREATE POLICY "auth update activity_log" ON public.activity_log
FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "auth delete activity_log" ON public.activity_log;
CREATE POLICY "auth delete activity_log" ON public.activity_log
FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

-- audit_logs: portal users can insert their own portal-scoped logs
DROP POLICY IF EXISTS "auth insert audit_logs" ON public.audit_logs;
CREATE POLICY "auth insert audit_logs" ON public.audit_logs
FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth read audit_logs" ON public.audit_logs;
CREATE POLICY "auth read audit_logs" ON public.audit_logs
FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
