
DROP POLICY IF EXISTS "staff insert portal activity" ON public.portal_activity_log;
CREATE POLICY "staff insert portal activity"
  ON public.portal_activity_log FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));
