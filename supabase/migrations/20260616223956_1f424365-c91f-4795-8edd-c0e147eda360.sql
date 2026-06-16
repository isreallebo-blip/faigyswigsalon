
CREATE TYPE public.client_file_category AS ENUM (
  'photo_before','photo_after','consent_form','measurements',
  'insurance_medical','invoice_receipt','correspondence','other'
);

CREATE TABLE public.client_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  display_name TEXT NOT NULL,
  category public.client_file_category NOT NULL DEFAULT 'other',
  notes TEXT,
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  mime_type TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX client_files_client_id_idx ON public.client_files(client_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_files TO authenticated;
GRANT ALL ON public.client_files TO service_role;

ALTER TABLE public.client_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view all client files"
  ON public.client_files FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can upload client files"
  ON public.client_files FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND uploaded_by = auth.uid());

CREATE POLICY "Staff can update own uploads, admins any"
  ON public.client_files FOR UPDATE
  TO authenticated
  USING (
    public.is_staff(auth.uid()) AND
    (uploaded_by = auth.uid() OR public.is_admin(auth.uid()))
  )
  WITH CHECK (
    public.is_staff(auth.uid()) AND
    (uploaded_by = auth.uid() OR public.is_admin(auth.uid()))
  );

CREATE POLICY "Staff can delete own uploads, admins any"
  ON public.client_files FOR DELETE
  TO authenticated
  USING (
    public.is_staff(auth.uid()) AND
    (uploaded_by = auth.uid() OR public.is_admin(auth.uid()))
  );

CREATE TRIGGER client_files_touch_updated_at
  BEFORE UPDATE ON public.client_files
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Storage policies: staff-only access to client-files bucket
CREATE POLICY "Staff can read client-files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'client-files' AND public.is_staff(auth.uid()));

CREATE POLICY "Staff can upload to client-files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'client-files' AND public.is_staff(auth.uid()));

CREATE POLICY "Staff can update client-files (own or admin)"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'client-files' AND public.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'client-files' AND public.is_staff(auth.uid()));

CREATE POLICY "Staff can delete from client-files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'client-files' AND public.is_staff(auth.uid()));
