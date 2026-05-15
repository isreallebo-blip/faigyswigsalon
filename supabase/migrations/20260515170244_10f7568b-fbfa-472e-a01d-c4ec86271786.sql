ALTER TABLE public.clients ALTER COLUMN display_id SET DEFAULT ('CLT-' || lpad(nextval('public.clients_display_seq')::text, 6, '0'));
ALTER TABLE public.vendors ALTER COLUMN display_id SET DEFAULT ('VND-' || lpad(nextval('public.vendors_display_seq')::text, 6, '0'));
ALTER TABLE public.wigs    ALTER COLUMN display_id SET DEFAULT ('WIG-' || lpad(nextval('public.wigs_display_seq')::text, 6, '0'));