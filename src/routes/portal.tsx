import { createFileRoute, Outlet, Link, useLocation, redirect, useNavigate } from "@tanstack/react-router";
import { Home, Calendar, Sparkles, CreditCard, User, LogOut, MessageSquare } from "lucide-react";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getPortalUnreadCount } from "@/lib/portal.functions";

export const Route = createFileRoute("/portal")({
  beforeLoad: async ({ location }) => {
    const path = location.pathname;
    const isAuthRoute = path === "/portal/login" || path === "/portal/verify";
    const { data } = await supabase.auth.getSession();
    if (!data.session && !isAuthRoute) {
      throw redirect({ to: "/portal/login" });
    }
    if (data.session && isAuthRoute) {
      // already signed in
      throw redirect({ to: "/portal" });
    }
  },
  head: () => ({ meta: [{ title: "Client Portal — Faigy's Wig Salon" }] }),
  component: PortalLayout,
});

function PortalLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;
  const isAuthRoute = path === "/portal/login" || path === "/portal/verify";

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/portal/login" });
  };

  return (
    <div
      className="min-h-screen pb-24"
      style={{
        background: "linear-gradient(180deg, oklch(0.97 0.02 80) 0%, oklch(0.99 0.01 80) 100%)",
        color: "oklch(0.20 0.01 60)",
      }}
    >
      <header className="sticky top-0 z-30 backdrop-blur bg-[oklch(0.99_0.01_80/0.85)] border-b border-[oklch(0.88_0.04_80)]">
        <div className="mx-auto max-w-2xl px-5 py-4 flex items-center justify-between">
          <Link to="/portal" className="font-display text-xl tracking-wide text-[oklch(0.25_0.02_60)]">
            Faigy's Wig Salon
          </Link>
          {!isAuthRoute && (
            <button
              onClick={signOut}
              className="text-xs text-[oklch(0.45_0.02_60)] hover:text-[oklch(0.20_0.01_60)] flex items-center gap-1"
            >
              <LogOut className="size-3.5" /> Sign out
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-6">
        <Outlet />
      </main>

      {!isAuthRoute && (
        <nav className="fixed bottom-0 inset-x-0 z-40 bg-[oklch(0.99_0.01_80)] border-t border-[oklch(0.88_0.04_80)]">
          <div className="mx-auto max-w-2xl grid grid-cols-6">
            <PortalTab to="/portal" icon={<Home className="size-5" />} label="Home" exact />
            <PortalTab to="/portal/appointments" icon={<Calendar className="size-5" />} label="Appts" />
            <PortalTab to="/portal/wigs" icon={<Sparkles className="size-5" />} label="Wigs" />
            <PortalTab to="/portal/messages" icon={<MessageSquare className="size-5" />} label="Messages" badge={<MessagesUnread />} />
            <PortalTab to="/portal/payments" icon={<CreditCard className="size-5" />} label="Pay" />
            <PortalTab to="/portal/profile" icon={<User className="size-5" />} label="Profile" />
          </div>
        </nav>
      )}
    </div>
  );
}

function PortalTab({
  to,
  icon,
  label,
  exact,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  exact?: boolean;
}) {
  const loc = useLocation();
  const active = exact ? loc.pathname === to : loc.pathname.startsWith(to);
  return (
    <Link
      to={to}
      className="flex flex-col items-center justify-center py-3 gap-0.5"
      style={{ color: active ? "oklch(0.55 0.13 75)" : "oklch(0.45 0.02 60)" }}
    >
      {icon}
      <span className="text-[10px] font-medium tracking-wide uppercase">{label}</span>
    </Link>
  );
}
