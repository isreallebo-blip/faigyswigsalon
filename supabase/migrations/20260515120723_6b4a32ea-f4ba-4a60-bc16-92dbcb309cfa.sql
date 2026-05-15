
-- Vendor type & status enums
DO $$ BEGIN
  CREATE TYPE public.vendor_type AS ENUM ('supplier', 'repair', 'both');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.vendor_status AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company text,
  phone text,
  email text,
  address text,
  website text,
  notes text,
  type public.vendor_type NOT NULL DEFAULT 'supplier',
  status public.vendor_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read vendors"   ON public.vendors FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert vendors" ON public.vendors FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update vendors" ON public.vendors FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete vendors" ON public.vendors FOR DELETE TO authenticated USING (true);

CREATE TRIGGER vendors_touch_updated_at
BEFORE UPDATE ON public.vendors
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Tie vendor to inventory wigs (supplier the wig was bought from)
ALTER TABLE public.wigs
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_wigs_vendor ON public.wigs(vendor_id);

-- Tie vendor to repairs (in addition to existing free-text "vendor" column)
ALTER TABLE public.repairs
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_repairs_vendor ON public.repairs(vendor_id);

-- Tie vendor to custom orders
ALTER TABLE public.custom_orders
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_custom_orders_vendor ON public.custom_orders(vendor_id);
