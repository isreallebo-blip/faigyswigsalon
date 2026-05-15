import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { getPortalPayments } from "@/lib/portal.functions";
import { hebrewDateString } from "@/lib/hebrew-calendar";
import { Card } from "@/routes/portal.index";

export const Route = createFileRoute("/portal/payments")({
  component: PaymentsPage,
});

function PaymentsPage() {
  const fn = useServerFn(getPortalPayments);
  const q = useQuery({ queryKey: ["portal-payments"], queryFn: () => fn() });
  const data = q.data;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl text-[oklch(0.22_0.02_60)]">My Payments</h1>

      {(data?.outstanding ?? 0) > 0 && (
        <div
          className="rounded-2xl p-5"
          style={{
            background: "oklch(0.95 0.08 80)",
            color: "oklch(0.35 0.1 75)",
          }}
        >
          <p className="text-xs uppercase tracking-wider">Outstanding balance</p>
          <p className="mt-1 font-display text-3xl">${data!.outstanding.toFixed(2)}</p>
        </div>
      )}

      <Card>
        <p className="text-xs uppercase tracking-wider text-[oklch(0.55_0.13_75)]">Total spent</p>
        <p className="mt-1 font-display text-2xl text-[oklch(0.22_0.02_60)]">
          ${(data?.totalSpent ?? 0).toFixed(2)}
        </p>
      </Card>

      <div className="space-y-3">
        {(data?.rows ?? []).map((p) => {
          const d = new Date(p.date);
          return (
            <Card key={p.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-[oklch(0.55_0.13_75)]">
                    {format(d, "MMM d, yyyy")} · {hebrewDateString(d)}
                  </p>
                  <p className="mt-1 font-display text-base text-[oklch(0.22_0.02_60)]">
                    {p.description ?? "Payment"}
                  </p>
                  <p className="text-xs text-[oklch(0.45_0.02_60)]">
                    {p.method.replace("_", " ")} · {p.status}
                  </p>
                </div>
                <p className="font-display text-xl text-[oklch(0.22_0.02_60)]">
                  ${Number(p.amount).toFixed(2)}
                </p>
              </div>
            </Card>
          );
        })}
        {!q.isLoading && (data?.rows ?? []).length === 0 && (
          <Card>
            <p className="text-sm text-[oklch(0.45_0.02_60)]">No payments yet.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
