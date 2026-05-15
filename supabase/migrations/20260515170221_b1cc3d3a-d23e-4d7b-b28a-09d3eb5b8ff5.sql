-- Sequences
CREATE SEQUENCE IF NOT EXISTS public.clients_display_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.vendors_display_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.wigs_display_seq START 1;

-- Add display_id columns
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS display_id text;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS display_id text;
ALTER TABLE public.wigs    ADD COLUMN IF NOT EXISTS display_id text;

-- Backfill existing rows by created_at order
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.clients WHERE display_id IS NULL ORDER BY created_at, id LOOP
    UPDATE public.clients SET display_id = 'CLT-' || lpad(nextval('public.clients_display_seq')::text, 6, '0') WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT id FROM public.vendors WHERE display_id IS NULL ORDER BY created_at, id LOOP
    UPDATE public.vendors SET display_id = 'VND-' || lpad(nextval('public.vendors_display_seq')::text, 6, '0') WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT id FROM public.wigs WHERE display_id IS NULL ORDER BY created_at, id LOOP
    UPDATE public.wigs SET display_id = 'WIG-' || lpad(nextval('public.wigs_display_seq')::text, 6, '0') WHERE id = r.id;
  END LOOP;
END $$;

-- NOT NULL + UNIQUE
ALTER TABLE public.clients ALTER COLUMN display_id SET NOT NULL;
ALTER TABLE public.vendors ALTER COLUMN display_id SET NOT NULL;
ALTER TABLE public.wigs    ALTER COLUMN display_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS clients_display_id_key ON public.clients(display_id);
CREATE UNIQUE INDEX IF NOT EXISTS vendors_display_id_key ON public.vendors(display_id);
CREATE UNIQUE INDEX IF NOT EXISTS wigs_display_id_key    ON public.wigs(display_id);

-- Assignment + immutability triggers
CREATE OR REPLACE FUNCTION public.assign_client_display_id()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.display_id IS NULL THEN
    NEW.display_id := 'CLT-' || lpad(nextval('public.clients_display_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.assign_vendor_display_id()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.display_id IS NULL THEN
    NEW.display_id := 'VND-' || lpad(nextval('public.vendors_display_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.assign_wig_display_id()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.display_id IS NULL THEN
    NEW.display_id := 'WIG-' || lpad(nextval('public.wigs_display_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.protect_display_id()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.display_id IS DISTINCT FROM OLD.display_id THEN
    RAISE EXCEPTION 'display_id is immutable';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_clients_display_id_assign ON public.clients;
CREATE TRIGGER trg_clients_display_id_assign BEFORE INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.assign_client_display_id();

DROP TRIGGER IF EXISTS trg_vendors_display_id_assign ON public.vendors;
CREATE TRIGGER trg_vendors_display_id_assign BEFORE INSERT ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.assign_vendor_display_id();

DROP TRIGGER IF EXISTS trg_wigs_display_id_assign ON public.wigs;
CREATE TRIGGER trg_wigs_display_id_assign BEFORE INSERT ON public.wigs
  FOR EACH ROW EXECUTE FUNCTION public.assign_wig_display_id();

DROP TRIGGER IF EXISTS trg_clients_display_id_protect ON public.clients;
CREATE TRIGGER trg_clients_display_id_protect BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.protect_display_id();

DROP TRIGGER IF EXISTS trg_vendors_display_id_protect ON public.vendors;
CREATE TRIGGER trg_vendors_display_id_protect BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.protect_display_id();

DROP TRIGGER IF EXISTS trg_wigs_display_id_protect ON public.wigs;
CREATE TRIGGER trg_wigs_display_id_protect BEFORE UPDATE ON public.wigs
  FOR EACH ROW EXECUTE FUNCTION public.protect_display_id();