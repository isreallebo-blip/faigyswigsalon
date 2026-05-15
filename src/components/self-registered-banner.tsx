import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, X } from "lucide-react";
import { getSelfRegisteredCount, acknowledgeSelfRegistrations } from "@/lib/portal.functions";

export function SelfRegisteredBanner() {
  const countFn = useServerFn(getSelfRegisteredCount);
  const ackFn = useServerFn(acknowledgeSelfRegistrations);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["self-registered-count"], queryFn: () => countFn() });
  const m = useMutation({
    mutationFn: () => ackFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["self-registered-count"] }),
  });

  const count = q.data?.count ?? 0;
  if (count === 0) return null;

  return (
    <div className="rounded-xl border border-[oklch(0.85_0.07_80)] bg-[oklch(0.96_0.05_80)] p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Sparkles className="size-4 text-[oklch(0.55_0.13_75)]" />
        <p className="text-sm text-[oklch(0.35_0.05_75)]">
          <span className="font-medium">{count}</span> new client
          {count > 1 ? "s" : ""} self-registered through the portal. Look for the "Self
          Registered" tag below to add more details.
        </p>
      </div>
      <button
        onClick={() => m.mutate()}
        disabled={m.isPending}
        className="text-xs text-[oklch(0.45_0.05_75)] hover:text-[oklch(0.30_0.05_75)] flex items-center gap-1"
      >
        <X className="size-3.5" /> Dismiss
      </button>
    </div>
  );
}
