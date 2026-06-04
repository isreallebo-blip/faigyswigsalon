
DROP POLICY IF EXISTS "public read wig photos" ON storage.objects;
DROP POLICY IF EXISTS "avatars public read" ON storage.objects;

-- Convert avatar URLs to paths
UPDATE public.profiles
SET avatar_url = regexp_replace(avatar_url, '^.*/storage/v1/object/public/avatars/', '')
WHERE avatar_url LIKE '%/storage/v1/object/public/avatars/%';

-- Convert each entry in wigs.photos[] from public URL to path
UPDATE public.wigs
SET photos = ARRAY(
  SELECT regexp_replace(p, '^.*/storage/v1/object/public/wig-photos/', '')
  FROM unnest(photos) AS p
)
WHERE EXISTS (
  SELECT 1 FROM unnest(photos) AS p WHERE p LIKE '%/storage/v1/object/public/wig-photos/%'
);
