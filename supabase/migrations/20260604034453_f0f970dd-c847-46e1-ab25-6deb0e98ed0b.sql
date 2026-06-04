
-- 1) Clients: remove portal client self-update via RLS (portal updates go through server-side admin fn)
DROP POLICY IF EXISTS "auth update clients" ON public.clients;
CREATE POLICY "auth update clients" ON public.clients
  FOR UPDATE TO authenticated
  USING (is_staff(auth.uid()))
  WITH CHECK (is_staff(auth.uid()));

-- 2) Storage: restrict client-photos and wig-photos to staff only
DROP POLICY IF EXISTS "auth read client photos" ON storage.objects;
DROP POLICY IF EXISTS "auth write client photos" ON storage.objects;
DROP POLICY IF EXISTS "auth update client photos" ON storage.objects;
DROP POLICY IF EXISTS "auth delete client photos" ON storage.objects;
DROP POLICY IF EXISTS "auth read wig photos" ON storage.objects;
DROP POLICY IF EXISTS "auth write wig photos" ON storage.objects;
DROP POLICY IF EXISTS "auth update wig photos" ON storage.objects;
DROP POLICY IF EXISTS "auth delete wig photos" ON storage.objects;

CREATE POLICY "staff read client photos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'client-photos' AND is_staff(auth.uid()));
CREATE POLICY "staff write client photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'client-photos' AND is_staff(auth.uid()));
CREATE POLICY "staff update client photos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'client-photos' AND is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'client-photos' AND is_staff(auth.uid()));
CREATE POLICY "staff delete client photos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'client-photos' AND is_staff(auth.uid()));

CREATE POLICY "staff read wig photos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'wig-photos' AND is_staff(auth.uid()));
CREATE POLICY "staff write wig photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'wig-photos' AND is_staff(auth.uid()));
CREATE POLICY "staff update wig photos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'wig-photos' AND is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'wig-photos' AND is_staff(auth.uid()));
CREATE POLICY "staff delete wig photos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'wig-photos' AND is_staff(auth.uid()));

-- 3) Avatars: add SELECT policy (own avatar, or staff can read any)
CREATE POLICY "avatars user read own or staff" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = (auth.uid())::text
      OR is_staff(auth.uid())
    )
  );

-- 4) Notification templates: staff-only read
DROP POLICY IF EXISTS "portal read enabled templates" ON public.notification_templates;
