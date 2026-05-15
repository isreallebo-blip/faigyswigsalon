import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPortalWigs } from "@/lib/portal.functions";
import { Card } from "@/routes/portal.index";

export const Route = createFileRoute("/portal/wigs")({
  component: WigsPage,
});

function WigsPage() {
  const fn = useServerFn(getPortalWigs);
  const q = useQuery({ queryKey: ["portal-wigs"], queryFn: () => fn() });
  const items = q.data ?? [];

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl text-[oklch(0.22_0.02_60)]">My Wigs</h1>
      {q.isLoading && <p className="text-sm text-[oklch(0.45_0.02_60)]">Loading…</p>}
      {!q.isLoading && items.length === 0 && (
        <Card>
          <p className="text-sm text-[oklch(0.45_0.02_60)]">No wigs on file yet.</p>
        </Card>
      )}
      <div className="space-y-3">
        {items.map((w) => {
          const inRepair = w.client_status === "At the repair shop";
          const ready = w.client_status === "Ready for pickup";
          return (
            <Card key={w.id}>
              <div className="flex gap-4">
                {w.photo ? (
                  <img
                    src={w.photo}
                    alt=""
                    className="size-20 rounded-xl object-cover border border-[oklch(0.88_0.04_80)]"
                  />
                ) : (
                  <div className="size-20 rounded-xl bg-[oklch(0.94_0.025_80)]" />
                )}
                <div className="flex-1">
                  <p className="text-xs uppercase tracking-wider text-[oklch(0.55_0.13_75)]">
                    {w.display_id}
                  </p>
                  <p className="font-display text-lg text-[oklch(0.22_0.02_60)]">
                    {w.style ?? "Wig"}
                  </p>
                  <p className="text-xs text-[oklch(0.45_0.02_60)]">
                    {[w.color, w.hair_type].filter(Boolean).join(" · ")}
                  </p>
                  <p
                    className="mt-2 inline-block text-[10px] uppercase tracking-wider font-medium px-2 py-1 rounded-full"
                    style={{
                      background: ready
                        ? "oklch(0.93 0.06 150)"
                        : inRepair
                        ? "oklch(0.94 0.05 75)"
                        : "oklch(0.94 0.025 80)",
                      color: ready
                        ? "oklch(0.35 0.08 150)"
                        : inRepair
                        ? "oklch(0.4 0.1 75)"
                        : "oklch(0.4 0.02 60)",
                    }}
                  >
                    {w.client_status}
                  </p>
                </div>
              </div>

              {inRepair && (
                <div className="mt-4">
                  <RepairProgress />
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function RepairProgress() {
  const steps = ["Sent to repair shop", "In progress", "Ready for pickup"];
  const current = 1; // wig is at repair shop & in progress
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => (
        <div key={s} className="flex-1">
          <div
            className="h-1 rounded-full"
            style={{
              background: i <= current ? "oklch(0.65 0.13 75)" : "oklch(0.9 0.02 80)",
            }}
          />
          <p
            className="mt-1.5 text-[10px] uppercase tracking-wider"
            style={{
              color: i <= current ? "oklch(0.45 0.1 75)" : "oklch(0.55 0.02 60)",
            }}
          >
            {s}
          </p>
        </div>
      ))}
    </div>
  );
}
