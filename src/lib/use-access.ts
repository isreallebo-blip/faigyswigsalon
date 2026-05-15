import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAccess } from "@/lib/admin-users.functions";

export function useAccess() {
  const fn = useServerFn(getMyAccess);
  const q = useQuery({
    queryKey: ["my-access"],
    queryFn: () => fn(),
    staleTime: 60_000,
  });
  return {
    isAdmin: q.data?.isAdmin ?? false,
    isStaff: q.data?.isStaff ?? false,
    loading: q.isLoading,
  };
}
