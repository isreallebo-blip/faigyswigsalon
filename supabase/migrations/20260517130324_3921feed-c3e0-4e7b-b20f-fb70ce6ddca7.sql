
-- Portal status enum
DO $$ BEGIN
  CREATE TYPE public.portal_account_status AS ENUM (
    'not_signed_up','active','locked','disabled','pending_verification'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Clients table extensions
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS portal_status public.portal_account_status NOT NULL DEFAULT 'not_signed_up',
  ADD COLUMN IF NOT EXISTS portal_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS portal_locked_by uuid,
  ADD COLUMN IF NOT EXISTS portal_lock_reason text,
  ADD COLUMN IF NOT EXISTS portal_lock_auto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS portal_disabled_by uuid,
  ADD COLUMN IF NOT EXISTS portal_invite_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS portal_invite_sent_by uuid,
  ADD COLUMN IF NOT EXISTS portal_failed_login_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS portal_last_failed_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS portal_signup_method text,
  ADD COLUMN IF NOT EXISTS portal_signup_at timestamptz,
  ADD COLUMN IF NOT EXISTS portal_last_login_at timestamptz;

-- Backfill: any client with auth_user_id is at least 'active'
UPDATE public.clients
SET portal_status = 'active'
WHERE auth_user_id IS NOT NULL AND portal_status = 'not_signed_up';

-- Activity log
CREATE TABLE IF NOT EXISTS public.portal_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  actor text NOT NULL CHECK (actor IN ('client','staff','system')),
  actor_user_id uuid,
  actor_name text,
  event_type text NOT NULL,
  summary text NOT NULL,
  ip_address text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_activity_log_client_idx
  ON public.portal_activity_log (client_id, created_at DESC);

ALTER TABLE public.portal_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read portal activity" ON public.portal_activity_log;
CREATE POLICY "staff read portal activity"
  ON public.portal_activity_log FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()) OR client_id = public.current_client_id());

DROP POLICY IF EXISTS "staff insert portal activity" ON public.portal_activity_log;
CREATE POLICY "staff insert portal activity"
  ON public.portal_activity_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Seed portal notification templates (idempotent)
INSERT INTO public.notification_templates (key, label, category, enabled, send_sms, send_email, sms_body, email_subject, email_body)
VALUES
  ('portal_invite','Portal invitation','Portal',true,true,true,
   'Hi [First Name], you''re invited to access your personal client portal at Faigy''s Wig Salon. View your appointments, wigs, payments and more. Sign up here: [Portal Link] — Faigy''s Wig Salon',
   'Your client portal invitation',
   'Hi [First Name],

You''re invited to access your personal client portal at Faigy''s Wig Salon. View your appointments, wigs, payments and more.

Sign up here: [Portal Link]

— Faigy''s Wig Salon'),
  ('portal_password_reset','Portal password reset','Portal',true,true,true,
   'Hi [First Name], here is the link to reset your Faigy''s Wig Salon portal password: [Reset Link]',
   'Reset your portal password',
   'Hi [First Name],

Click the link below to reset your portal password:

[Reset Link]

If you did not request this, please ignore this message.

— Faigy''s Wig Salon'),
  ('portal_locked_auto','Portal auto-locked','Portal',true,true,true,
   'Your Faigy''s Wig Salon portal account has been locked after multiple failed login attempts. Please contact us to restore access.',
   'Your portal account is locked',
   'Hi [First Name],

Your Faigy''s Wig Salon portal account has been locked after multiple failed login attempts. Please contact us to restore access.

— Faigy''s Wig Salon'),
  ('portal_unlocked','Portal access restored','Portal',true,true,true,
   'Hi [First Name], your Faigy''s Wig Salon portal access has been restored. You can log in here: [Portal Link]',
   'Your portal access has been restored',
   'Hi [First Name],

Your Faigy''s Wig Salon portal access has been restored. You can log in here:

[Portal Link]

— Faigy''s Wig Salon'),
  ('portal_signed_out_all','Signed out of all devices','Portal',true,true,true,
   'You have been signed out of all devices on Faigy''s Wig Salon portal. If you did not request this, please contact us.',
   'You were signed out of all devices',
   'Hi [First Name],

You have been signed out of all devices on Faigy''s Wig Salon portal. If you did not request this, please contact us.

— Faigy''s Wig Salon')
ON CONFLICT (key) DO NOTHING;
