
-- Subject type
CREATE TYPE public.verification_subject AS ENUM ('staff', 'client');
CREATE TYPE public.verification_purpose AS ENUM ('reauth', 'email_change', 'phone_change');
CREATE TYPE public.verification_channel AS ENUM ('email', 'sms');

-- Active verification challenges
CREATE TABLE public.verification_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject_type public.verification_subject NOT NULL,
  purpose public.verification_purpose NOT NULL DEFAULT 'reauth',
  channel public.verification_channel NOT NULL,
  destination_masked text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vc_user ON public.verification_challenges(user_id, subject_type, created_at DESC);

-- Lockouts
CREATE TABLE public.verification_lockouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject_type public.verification_subject NOT NULL,
  locked_until timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vl_active ON public.verification_lockouts(user_id, subject_type, locked_until DESC);

-- Verified sessions (15 min sliding unlock)
CREATE TABLE public.verified_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject_type public.verification_subject NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX idx_vs_user ON public.verified_sessions(user_id, subject_type, expires_at DESC);

-- Pending email changes (link-confirmed)
CREATE TABLE public.pending_email_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject_type public.verification_subject NOT NULL,
  old_email text,
  new_email text NOT NULL,
  confirm_token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Pending phone changes (code-confirmed)
CREATE TABLE public.pending_phone_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject_type public.verification_subject NOT NULL,
  old_phone text,
  new_phone text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Helper functions
CREATE OR REPLACE FUNCTION public.is_user_locked(_uid uuid, _subject public.verification_subject)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT MAX(locked_until) FROM public.verification_lockouts
  WHERE user_id = _uid AND subject_type = _subject AND locked_until > now()
$$;

CREATE OR REPLACE FUNCTION public.is_user_verified(_uid uuid, _subject public.verification_subject)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT MAX(expires_at) FROM public.verified_sessions
  WHERE user_id = _uid AND subject_type = _subject AND expires_at > now()
$$;

-- Enable RLS
ALTER TABLE public.verification_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_lockouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verified_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_email_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_phone_changes ENABLE ROW LEVEL SECURITY;

-- RLS: read-only access to own rows. All writes go through admin server fns.
-- Staff = auth.uid() match; client subject = match current_client_id().
CREATE POLICY "own challenges read" ON public.verification_challenges
  FOR SELECT TO authenticated USING (
    (subject_type = 'staff' AND user_id = auth.uid())
    OR (subject_type = 'client' AND user_id = current_client_id())
  );

CREATE POLICY "own lockouts read" ON public.verification_lockouts
  FOR SELECT TO authenticated USING (
    (subject_type = 'staff' AND user_id = auth.uid())
    OR (subject_type = 'client' AND user_id = current_client_id())
    OR is_admin(auth.uid())
  );

CREATE POLICY "own verified read" ON public.verified_sessions
  FOR SELECT TO authenticated USING (
    (subject_type = 'staff' AND user_id = auth.uid())
    OR (subject_type = 'client' AND user_id = current_client_id())
  );

CREATE POLICY "own pending email read" ON public.pending_email_changes
  FOR SELECT TO authenticated USING (
    (subject_type = 'staff' AND user_id = auth.uid())
    OR (subject_type = 'client' AND user_id = current_client_id())
  );

CREATE POLICY "own pending phone read" ON public.pending_phone_changes
  FOR SELECT TO authenticated USING (
    (subject_type = 'staff' AND user_id = auth.uid())
    OR (subject_type = 'client' AND user_id = current_client_id())
  );
