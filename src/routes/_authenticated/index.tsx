import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, startOfDay, endOfDay, startOfMonth, subMonths } from "date-fns";
import { HebrewToday } from "@/components/hebrew-today";
import {
  CalendarDays,
  Wrench,
  AlertCircle,
  Wallet,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  CartesianGrid,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Dashboard — Faigy's Wig Salon" }] }),
  component: Dashboard,
});

function Dashboard() {
  const today = useQuery({
    queryKey: ["dashboard", "today-appts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, type, status, starts_at, notes, clients(full_name)")
        .gte("starts_at", startOfDay(new Date()).toISOString())
        .lte("starts_at", endOfDay(new Date()).toISOString())
        .order("starts_at");
      if (error) throw error;
      return data;
    },
  });

  const atVendor = useQuery({
    queryKey: ["dashboard", "at-vendor"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("repairs")
        .select("id, vendor, work_requested, expected_return, wigs(brand, style), clients(full_name)")
        .in("status", ["sent_to_vendor", "in_progress"])
        .order("date_sent", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const lowStock = useQuery({
    queryKey: ["dashboard", "low-stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wigs")
        .select("id, brand, style, color, quantity")
        .lte("quantity", 1)
        .eq("status", "available");
      if (error) throw error;
      return data;
    },
  });

  const revenue = useQuery({
    queryKey: ["dashboard", "revenue"],
    queryFn: async () => {
      const since = subMonths(startOfMonth(new Date()), 5).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("payments")
        .select("date, amount")
        .gte("date", since);
      if (error) throw error;
      const byMonth = new Map<string, number>();
      for (let i = 5; i >= 0; i--) {
        const d = subMonths(new Date(), i);
        byMonth.set(format(d, "MMM"), 0);
      }
      data?.forEach((p) => {
        const key = format(new Date(p.date), "MMM");
        byMonth.set(key, (byMonth.get(key) ?? 0) + Number(p.amount));
      });
      return Array.from(byMonth.entries()).map(([month, total]) => ({ month, total }));
    },
  });

  const monthTotal = revenue.data?.[revenue.data.length - 1]?.total ?? 0;

  const disputes = useQuery({
    queryKey: ["dashboard", "open-disputes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, amount, dispute_reason, dispute_deadline, dispute_opened_at, client:client_id(full_name)")
        .eq("status", "disputed")
        .order("dispute_deadline", { ascending: true, nullsFirst: false })
        .limit(10);
      if (error) throw error;
      return data as Array<{
        id: string;
        amount: number;
        dispute_reason: string | null;
        dispute_deadline: string | null;
        dispute_opened_at: string | null;
        client: { full_name: string } | null;
      }>;
    },
  });

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
          {format(new Date(), "EEEE, MMMM d, yyyy")}
        </p>
        <HebrewToday />
        <h1 className="mt-1 font-display text-4xl">Good day at the salon</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<CalendarDays className="h-4 w-4" />}
          label="Today's appointments"
          value={today.isLoading ? "—" : String(today.data?.length ?? 0)}
        />
        <StatCard
          icon={<Wrench className="h-4 w-4" />}
          label="At vendor"
          value={atVendor.isLoading ? "—" : String(atVendor.data?.length ?? 0)}
        />
        <StatCard
          icon={<AlertCircle className="h-4 w-4" />}
          label="Low stock"
          value={lowStock.isLoading ? "—" : String(lowStock.data?.length ?? 0)}
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="This month"
          value={`$${monthTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-display text-2xl">Revenue, last 6 months</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {revenue.isLoading ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenue.data}>
                    <defs>
                      <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--gold)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="var(--gold)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                    <RTooltip
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Area type="monotone" dataKey="total" stroke="var(--gold)" strokeWidth={2} fill="url(#rev)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl">Today</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {today.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : today.data && today.data.length > 0 ? (
              today.data.map((a) => (
                <div key={a.id} className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0">
                  <div>
                    <div className="text-sm font-medium">{a.clients?.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground capitalize">{a.type.replace("_", " ")}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm tabular-nums">{format(new Date(a.starts_at), "h:mm a")}</div>
                    <Badge variant="secondary" className="mt-1 text-[10px] capitalize">{a.status}</Badge>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No appointments scheduled today.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {disputes.data && disputes.data.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="font-display text-2xl flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" /> Open disputes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {disputes.data.map((d) => (
              <a
                key={d.id}
                href={`/payments/${d.id}`}
                className="flex items-start justify-between gap-3 rounded-md border border-amber-500/30 bg-background/60 p-3 transition hover:border-amber-500"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">{d.client?.full_name ?? "Unknown client"}</div>
                  <div className="text-xs text-muted-foreground line-clamp-1">{d.dispute_reason ?? "No reason recorded"}</div>
                </div>
                <div className="text-right text-xs">
                  <div className="font-display text-lg tabular-nums">${Number(d.amount).toLocaleString()}</div>
                  <div className="text-amber-700 dark:text-amber-300">
                    {d.dispute_deadline ? `Due ${format(new Date(d.dispute_deadline), "MMM d")}` : "No deadline"}
                  </div>
                </div>
              </a>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl">At vendor for repair</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {atVendor.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : atVendor.data && atVendor.data.length > 0 ? (
              atVendor.data.map((r) => (
                <div key={r.id} className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0">
                  <div>
                    <div className="text-sm font-medium">
                      {r.wigs ? `${r.wigs.brand ?? ""} ${r.wigs.style ?? ""}`.trim() : "Wig"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.clients?.full_name ?? "—"} · {r.vendor}
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    {r.expected_return ? `Due ${format(new Date(r.expected_return), "MMM d")}` : "No ETA"}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Nothing currently at a vendor.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl">Low stock</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {lowStock.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : lowStock.data && lowStock.data.length > 0 ? (
              lowStock.data.map((w) => (
                <div key={w.id} className="flex items-center justify-between border-b border-border pb-3 last:border-0">
                  <div>
                    <div className="text-sm font-medium">{w.brand} {w.style}</div>
                    <div className="text-xs text-muted-foreground">{w.color}</div>
                  </div>
                  <Badge variant="outline" className="border-gold text-gold">{w.quantity} left</Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Inventory is healthy.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-accent-foreground">
            {icon}
          </span>
          <span className="text-xs uppercase tracking-wider">{label}</span>
        </div>
        <div className="mt-3 font-display text-3xl">{value}</div>
      </CardContent>
    </Card>
  );
}
