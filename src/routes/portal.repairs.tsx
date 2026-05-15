import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { getPortalRepairs } from "@/lib/portal.functions";
import { Card } from "@/routes/portal.index";

export const Route = createFileRoute("/portal/repairs")({
  component: RepairsPage,
});

function RepairsPage() {
  const fn = useServerFn(getPortalRepairs);
  const q = useQuery({ queryKey: ["portal-repairs"], queryFn: () => fn() });
  const items = q.data ?? [];
  const current = items.filter((r) => r.client_status !== "Completed");
  const past = items.filter((r) => r.client_status === "Completed");

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl text-[oklch(0.22_0.02_60)]">My Repairs</h1>

      {current.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-wider text-[oklch(0.55_0.13_75)]">In progress</p>
          {current.map((r) => (
            <RepairRow key={r.id} r={r} highlight />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-wider text-[oklch(0.55_0.13_75)]">History</p>
          {past.map((r) => (
            <RepairRow key={r.id} r={r} />
          ))}
        </div>
      )}

      {!q.isLoading && items.length === 0 && (
        <Card>
          <p className="text-sm text-[oklch(0.45_0.02_60)]">No repair history.</p>
        </Card>
      )}
    </div>
  );
}

type Repair = {
  id: string;
  wig: { display_id: string; style: string | null } | null;
  vendor_label: string;
  work_requested: string | null;
  date_sent: string | null;
  expected_return: string | null;
  actual_return: string | null;
  client_status: string;
};

function RepairRow({ r, highlight }: { r: Repair; highlight?: boolean }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-[oklch(0.55_0.13_75)]">
            {r.wig?.display_id ?? "Wig"} {r.wig?.style ? `· ${r.wig.style}` : ""}
          </p>
          <p className="mt-1 font-display text-lg text-[oklch(0.22_0.02_60)]">
            {r.work_requested ?? "Repair"}
          </p>
          <p className="text-xs text-[oklch(0.45_0.02_60)]">
            Sent {r.date_sent ? format(new Date(r.date_sent), "MMM d, yyyy") : "—"} to{" "}
            {r.vendor_label}
          </p>
          {r.expected_return && r.client_status !== "Completed" && (
            <p className="mt-1 text-xs text-[oklch(0.55_0.13_75)]">
              Estimated return: {format(new Date(r.expected_return), "MMM d, yyyy")}
            </p>
          )}
          {r.actual_return && (
            <p className="mt-1 text-xs text-[oklch(0.45_0.02_60)]">
              Returned: {format(new Date(r.actual_return), "MMM d, yyyy")}
            </p>
          )}
        </div>
        <span
          className="text-[10px] uppercase tracking-wider font-medium px-2 py-1 rounded-full"
          style={{
            background: highlight ? "oklch(0.94 0.05 75)" : "oklch(0.94 0.025 80)",
            color: highlight ? "oklch(0.4 0.1 75)" : "oklch(0.4 0.02 60)",
          }}
        >
          {r.client_status}
        </span>
      </div>
    </Card>
  );
}
