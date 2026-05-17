-- Make is_staff respect profile status so disabled staff lose CRM access
-- without touching their auth.users record (which the client portal also uses).
CREATE OR REPLACE FUNCTION public.is_staff(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _uid
      AND COALESCE(status, 'active'::public.user_status) <> 'disabled'::public.user_status
  )
$function$;

-- Lift bans from any auth users that were previously disabled via the staff
-- disable flow. Their CRM access remains revoked through profiles.status.
UPDATE auth.users
SET banned_until = NULL
WHERE banned_until IS NOT NULL
  AND banned_until > now()
  AND id IN (SELECT id FROM public.profiles WHERE status = 'disabled');