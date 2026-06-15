import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  LayoutDashboard,
  Users,
  Package,
  Workflow,
  CalendarDays,
  Wrench,
  Wallet,
  Building2,
  MessageSquare,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useAccess } from "@/lib/use-access";
import { useMyProfile } from "@/lib/use-profile";
import { UserAvatar } from "@/components/user-avatar";
import { getStaffUnreadCount } from "@/lib/inbox.functions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const BASE_TITLE = "Faigy's Wig Salon";

function useUnreadInbox() {
  const fn = useServerFn(getStaffUnreadCount);
  const [visible, setVisible] = useState(
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );
  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  const q = useQuery({
    queryKey: ["staff-inbox-unread"],
    queryFn: () => fn(),
    refetchInterval: visible ? 30_000 : false,
    refetchOnWindowFocus: true,
  });
  const count = q.data ?? 0;
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = count > 0 ? `(${count > 99 ? "99+" : count}) ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [count]);
  return count;
}

function UnreadBadge({ count }: { count: number }) {
  if (!count) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span
      className="ml-auto inline-flex items-center justify-center rounded-full px-1.5 font-medium text-white"
      style={{
        background: "oklch(0.55 0.2 25)",
        minWidth: 18,
        height: 18,
        fontSize: 10,
        lineHeight: 1,
      }}
      aria-label={`${count} unread messages`}
    >
      {label}
    </span>
  );
}


function UserMenu({ onSignOut }: { onSignOut: () => void }) {
  const { data: profile } = useMyProfile();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label="Open profile menu"
      >
        <UserAvatar profile={profile ?? undefined} size={32} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="text-sm font-medium truncate">
              {profile?.full_name || profile?.email || "Account"}
            </span>
            {profile?.email && profile?.full_name && (
              <span className="text-xs text-muted-foreground truncate">{profile.email}</span>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile">My profile</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut} className="text-destructive">
          <LogOut className="h-4 w-4 mr-2" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const baseNav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/inventory", label: "Inventory", icon: Package },
  { to: "/vendors", label: "Vendors", icon: Building2 },
  { to: "/workflows", label: "Service workflows", icon: Workflow },
  { to: "/appointments", label: "Appointments", icon: CalendarDays },
  { to: "/repairs", label: "Repairs", icon: Wrench },
  { to: "/payments", label: "Payments", icon: Wallet },
  { to: "/inbox", label: "Inbox", icon: MessageSquare },
] as const;
const adminNav = [{ to: "/settings", label: "Settings", icon: SettingsIcon }] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isAdmin } = useAccess();
  const nav = isAdmin ? [...baseNav, ...adminNav] : baseNav;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login", search: { redirect: "/" } });
  };

  const SidebarInner = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-6 py-7">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-gold to-gold-soft shadow-gold" />
        <div>
          <div className="font-display text-xl leading-none">Faigy's Wig Salon</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Wig salon CRM</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {nav.map((item) => {
          const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="active-pill"
                  className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-gold"
                />
              )}
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-sidebar-border">
        {SidebarInner}
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-foreground/30 lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "tween", duration: 0.2 }}
              className="fixed inset-y-0 left-0 z-50 w-64 lg:hidden"
            >
              {SidebarInner}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur lg:px-8">
          <button
            className="rounded-md p-2 hover:bg-muted lg:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="hidden lg:block text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {nav.find((n) => (n.to === "/" ? pathname === "/" : pathname.startsWith(n.to)))?.label ?? ""}
          </div>
          <UserMenu onSignOut={handleSignOut} />
        </header>
        <main className="flex-1 px-4 py-6 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
