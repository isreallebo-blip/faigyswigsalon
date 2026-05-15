import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/profile.functions";

export function useMyProfile() {
  const fn = useServerFn(getMyProfile);
  return useQuery({
    queryKey: ["my-profile"],
    queryFn: () => fn(),
    staleTime: 30_000,
  });
}

export function getInitials(profile?: {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
}) {
  if (!profile) return "?";
  const first = profile.first_name?.trim()?.[0];
  const last = profile.last_name?.trim()?.[0];
  if (first || last) return `${first ?? ""}${last ?? ""}`.toUpperCase();
  const fn = profile.full_name?.trim();
  if (fn) {
    const parts = fn.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
  }
  return profile.email?.[0]?.toUpperCase() ?? "?";
}

// Deterministic color from a string (for the initials avatar background).
export function avatarColor(seed?: string | null) {
  if (!seed) return "hsl(40 30% 50%)";
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 40% 45%)`;
}
