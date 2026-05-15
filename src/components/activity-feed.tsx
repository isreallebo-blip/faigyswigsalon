import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type Log = Database["public"]["Tables"]["audit_logs"]["Row"];

export function ActivityFeed({ recordId, limit = 100 }: { recordId: string; limit?: number }) {
  const q = useQuery({
    queryKey: ["audit", "record", recordId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("record_id", recordId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as Log[];
    },
  });

  if (q.isLoading) return <Skeleton className="h-32 w-full" />;
  if (!q.data?.length) return <p className="text-sm text-muted-foreground">No activity yet.</p>;

  return (
    <ol className="space-y-3">
      {q.data.map((l) => (
        <li key={l.id} className="rounded-lg border border-border p-3">
          <div className="flex items-center gap-2">
            <Badge variant={l.action === "delete" || l.action === "void" ? "destructive" : "secondary"} className="capitalize">{l.action}</Badge>
            <span className="text-sm">{l.summary}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {l.user_name ?? "Unknown"} · {format(new Date(l.created_at), "MMM d, yyyy HH:mm:ss")}
            {l.ip_address ? ` · ${l.ip_address}` : ""}
          </p>
          {l.changes && Object.keys(l.changes as Record<string, unknown>).length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted-foreground">View changes</summary>
              <pre className="mt-1 overflow-x-auto rounded bg-muted/40 p-2 text-[10px]">{JSON.stringify(l.changes, null, 2)}</pre>
            </details>
          )}
        </li>
      ))}
    </ol>
  );
}

export function RecordStamps({ createdAt, createdBy, updatedAt, updatedBy }: {
  createdAt?: string | null; createdBy?: string | null; updatedAt?: string | null; updatedBy?: string | null;
}) {
  if (!createdAt && !updatedAt) return null;
  return (
    <div className="border-t border-border pt-3 mt-4 text-xs text-muted-foreground space-y-0.5">
      {createdAt && <div>Created{createdBy ? ` by ${createdBy}` : ""} on {format(new Date(createdAt), "MMM d, yyyy")} at {format(new Date(createdAt), "HH:mm")}</div>}
      {updatedAt && <div>Last updated{updatedBy ? ` by ${updatedBy}` : ""} on {format(new Date(updatedAt), "MMM d, yyyy")} at {format(new Date(updatedAt), "HH:mm")}</div>}
    </div>
  );
}
