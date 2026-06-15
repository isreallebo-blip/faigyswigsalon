import { createFileRoute, Outlet, Link, useRouterState, redirect } from "@tanstack/react-router";
import { Users as UsersIcon, CalendarDays, ScrollText, ShieldCheck, CreditCard, Bell } from "lucide-react";
import { useAccess } from "@/lib/use-access";
import { cn } from "@/lib/utils";
import { getMyAccess } from "@/lib/admin-users.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  beforeLoad: async () => {
    try {
      const access = await getMyAccess();
      if (!access.isAdmin) throw redirect({ to: "/" });
    } catch (e) {
      // If the call itself failed (e.g. unauthenticated edge case), bounce home.
      if (e && typeof e === "object" && "to" in e) throw e;
      throw redirect({ to: "/" });
    }
  },
  component: SettingsLayout,
});

function SettingsLayout() {
  const { isAdmin, loading } = useAccess();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!isAdmin) return <div className="text-sm text-muted-foreground">Admins only.</div>;

  const tabs = [
    { to: "/settings/users", label: "Users", icon: UsersIcon },
    { to: "/settings/client-portal", label: "Client Portal", icon: ShieldCheck },
    { to: "/settings/calendar", label: "Calendar", icon: CalendarDays },
    { to: "/settings/notifications", label: "Notifications", icon: Bell },
    { to: "/settings/quickbooks", label: "QuickBooks", icon: CreditCard },
    { to: "/settings/audit-log", label: "Audit log", icon: ScrollText },
  ] as const;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your salon's account and team.</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[200px,1fr]">
        <nav className="space-y-1">
          {tabs.map((t) => {
            const active = pathname.startsWith(t.to);
            const Icon = t.icon;
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60",
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </Link>
            );
          })}
        </nav>
        <div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
