import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Resolve a stored photo reference to a displayable URL.
 *
 * - If the value is a full http(s) URL (e.g. a portal-supplied external photo),
 *   it is returned as-is.
 * - Otherwise it is treated as a path within the given private storage bucket
 *   and a short-lived signed URL is generated.
 */
export function useSignedPhoto(bucket: string, ref: string | null | undefined, expiresIn = 3600) {
  const isExternal = !!ref && /^https?:\/\//i.test(ref);
  const query = useQuery({
    queryKey: ["signed-photo", bucket, ref],
    enabled: !!ref && !isExternal,
    staleTime: (expiresIn - 60) * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(ref!, expiresIn);
      if (error) throw error;
      return data.signedUrl;
    },
  });
  if (!ref) return null;
  if (isExternal) return ref;
  return query.data ?? null;
}
