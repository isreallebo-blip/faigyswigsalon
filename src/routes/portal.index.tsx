import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, formatDistanceToNow } from "date-fns";
import { Calendar, Wrench, CreditCard, Sparkles } from "lucide-react";
import { getPortalDashboard, getPortalMe } from "@/lib/portal.functions";
import { hebrewDateString } from "@/lib/hebrew-calendar";

export const Route = createFileRoute("/portal/")({
  component: PortalHome,
});

function PortalHome() {
  const me = useServerFn(getPortalMe);
  const dash = useServerFn(getPortalDashboard);

  const meQ = useQuery({ queryKey: ["portal-me"], queryFn: () => me() });
  const dashQ = useQuery({ queryKey: ["portal-dashboard"], queryFn: () => dash() });

  const firstName = meQ.data?.client?.full_name?.split(" ")[0] ?? "there";
  const today = new Date();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wider text-[oklch(0.55_0.13_75)]">
          {format(today, "EEEE, MMMM d")} · {hebrewDateString(today)}
        </p>
        <h1 className="font-display text-3xl mt-2 text-[oklch(0.22_0.02_60)]">
          Welcome back, {firstName}
        </h1>
      </div>

      {dashQ.data?.nextAppointment && (
        <Card>
          <p className="text-xs uppercase tracking-wider text-[oklch(0.55_0.13_75)]">Next appointment</p>
          <p className="mt-2 font-display text-2xl text-[oklch(0.22_0.02_60)]">
            {format(new Date(dashQ.data.nextAppointment.starts_at), "EEEE, MMM d")}
          </p>
          <p className="text-sm text-[oklch(0.45_0.02_60)]">
            {format(new Date(dashQ.data.nextAppointment.starts_at), "h:mm a")} ·{" "}
            {labelFromType(dashQ.data.nextAppointment.type)}
          </p>
          <p className="mt-1 text-xs text-[oklch(0.55_0.13_75)]">
            In {formatDistanceToNow(new Date(dashQ.data.nextAppointment.starts_at))}
          </p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<Calendar className="size-4" />}
          label="Total visits"
          value={dashQ.data?.totalVisits ?? 0}
        />
        <StatCard
          icon={<Wrench className="size-4" />}
          label="Wigs in repair"
          value={dashQ.data?.repairsInProgressCount ?? 0}
        />
        <StatCard
          icon={<CreditCard className="size-4" />}
          label="Outstanding"
          value={`$${(dashQ.data?.outstandingBalance ?? 0).toFixed(2)}`}
        />
        <StatCard
          icon={<Sparkles className="size-4" />}
          label="Client ID"
          value={meQ.data?.client?.display_id ?? "—"}
          small
        />
      </div>
    </div>
  );
}

function labelFromType(t: string) {
  return t
    .split("_")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-5 border"
      style={{
        background: "oklch(0.99 0.01 80)",
        borderColor: "oklch(0.88 0.04 80)",
        boxShadow: "0 8px 28px -10px oklch(0.72 0.13 75 / 0.18)",
      }}
    >
      {children}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  small,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  small?: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-4 border"
      style={{ background: "oklch(0.99 0.01 80)", borderColor: "oklch(0.88 0.04 80)" }}
    >
      <div className="flex items-center gap-2 text-[oklch(0.55_0.13_75)]">
        {icon}
        <span className="text-[10px] uppercase tracking-wider font-medium">{label}</span>
      </div>
      <p
        className={`mt-2 font-display text-[oklch(0.22_0.02_60)] ${small ? "text-lg" : "text-2xl"}`}
      >
        {value}
      </p>
    </div>
  );
}
