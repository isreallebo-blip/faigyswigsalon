import { cn } from "@/lib/utils";
import { avatarColor, getInitials } from "@/lib/use-profile";

type ProfileLike = {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
};

export function UserAvatar({
  profile,
  size = 32,
  className,
}: {
  profile?: ProfileLike;
  size?: number;
  className?: string;
}) {
  const initials = getInitials(profile);
  const bg = avatarColor(profile?.email ?? profile?.full_name ?? initials);
  const fontSize = Math.round(size * 0.4);

  if (profile?.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt={profile.full_name ?? "Avatar"}
        className={cn("rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-medium text-white",
        className,
      )}
      style={{ width: size, height: size, background: bg, fontSize }}
      aria-hidden
    >
      {initials}
    </div>
  );
}
