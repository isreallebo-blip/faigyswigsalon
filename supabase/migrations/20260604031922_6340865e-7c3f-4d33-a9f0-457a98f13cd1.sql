
-- 1) Tighten WITH CHECK (true) insert policies
DROP POLICY IF EXISTS "auth insert activity_log" ON public.activity_log;
CREATE POLICY "staff insert activity_log" ON public.activity_log
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "auth insert audit_logs" ON public.audit_logs;
CREATE POLICY "staff insert audit_logs" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "staff insert notification_log" ON public.notification_log;
CREATE POLICY "staff insert notification_log" ON public.notification_log
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

-- 2) Restrict messaging_settings read to staff
DROP POLICY IF EXISTS "staff read messaging_settings" ON public.messaging_settings;
CREATE POLICY "staff read messaging_settings" ON public.messaging_settings
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- 3) Backfill admin role for existing staff (idempotent), then tighten is_staff to require a role row
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'admin'::public.app_role
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id
)
ON CONFLICT (user_id, role) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_staff(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _uid
      AND COALESCE(p.status, 'active'::public.user_status) <> 'disabled'::public.user_status
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _uid
      )
  )
$$;

-- 4) Fix mutable search_path on touch_updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 5) Revoke EXECUTE on SECURITY DEFINER functions that should not be client-callable.
-- Trigger functions and backend-only helpers: revoke from anon AND authenticated.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_portal_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_client_display_id() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_vendor_display_id() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_wig_display_id() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_display_id() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated, PUBLIC;

-- RLS helper functions: must remain callable by authenticated (used in policies),
-- but should not be callable by anonymous users.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_client_id() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_user_locked(uuid, public.verification_subject) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_user_verified(uuid, public.verification_subject) FROM anon, PUBLIC;
