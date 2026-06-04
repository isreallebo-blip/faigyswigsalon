
DROP POLICY IF EXISTS "public read client photos" ON storage.objects;

UPDATE public.clients
SET photo_url = regexp_replace(photo_url, '^.*/storage/v1/object/public/client-photos/', '')
WHERE photo_url LIKE '%/storage/v1/object/public/client-photos/%';
