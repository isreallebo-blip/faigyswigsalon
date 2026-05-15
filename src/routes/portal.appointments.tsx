import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, formatDistanceToNow, isFuture } from "date-fns";
import { getPortalAppointments } from "@/lib/portal.functions";
import { hebrewDateString } from "@/lib/hebrew-calendar";
import { Card } from "@/routes/portal.index";

export const Route = createFileRoute("/portal/appointments")({
  component: AppointmentsPage,
});

const TYPE_LABEL: Record<string, string> = {
  cut: "Cut",
  wash_set: "Wash & Set",
  consultation: "Consultation",
  fitting: "Fitting",
  repair: "Repair drop-off",
  pickup: "Pickup",
};

function AppointmentsPage() {
  const fn = useServerFn(getPortalAppointments);
  const q = useQuery({ queryKey: ["portal-appts"], queryFn: () => fn() });
  const items = q.data ?? [];

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl text-[oklch(0.22_0.02_60)]">My Appointments</h1>
      <p className="text-sm text-[oklch(0.45_0.02_60)]">
        To book or cancel, please contact the salon directly.
      </p>

      {q.isLoading && <p className="text-sm text-[oklch(0.45_0.02_60)]">Loading…</p>}
      {!q.isLoading && items.length === 0 && (
        <Card>
          <p className="text-sm text-[oklch(0.45_0.02_60)]">No appointments yet.</p>
        </Card>
      )}

      <div className="space-y-3">
        {items.map((a) => {
          const start = new Date(a.starts_at);
          const upcoming = isFuture(start) && a.status === "scheduled";
          return (
            <Card key={a.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-[oklch(0.55_0.13_75)]">
                    {TYPE_LABEL[a.type] ?? a.type}
                  </p>
                  <p className="mt-1 font-display text-xl text-[oklch(0.22_0.02_60)]">
                    {format(start, "EEE, MMM d · h:mm a")}
                  </p>
                  <p className="text-xs text-[oklch(0.45_0.02_60)]">{hebrewDateString(start)}</p>
                  {upcoming && (
                    <p className="mt-2 text-xs text-[oklch(0.55_0.13_75)]">
                      In {formatDistanceToNow(start)}
                    </p>
                  )}
                  {a.notes && (
                    <p className="mt-3 text-sm text-[oklch(0.35_0.02_60)] italic">
                      "{a.notes}"
                    </p>
                  )}
                </div>
                <StatusBadge status={a.status} />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; fg: string; label: string }> = {
    scheduled: { bg: "oklch(0.94 0.05 75)", fg: "oklch(0.4 0.1 75)", label: "Scheduled" },
    completed: { bg: "oklch(0.93 0.06 150)", fg: "oklch(0.35 0.08 150)", label: "Completed" },
    cancelled: { bg: "oklch(0.93 0.04 30)", fg: "oklch(0.4 0.08 30)", label: "Cancelled" },
    no_show: { bg: "oklch(0.92 0.02 60)", fg: "oklch(0.4 0.02 60)", label: "No-show" },
  };
  const s = styles[status] ?? styles.scheduled;
  return (
    <span
      className="text-[10px] uppercase tracking-wider font-medium px-2 py-1 rounded-full"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}
