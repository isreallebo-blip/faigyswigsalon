import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getBroadcast, retryFailedBroadcastRecipients } from "@/lib/broadcasts.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/broadcasts/$id")({
  component: BroadcastDetailPage,
});

type Recipient = {
  id: string;
  client_id: string | null;
  client_name: string | null;
  channel: string;
  recipient: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
};

function BroadcastDetailPage() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getBroadcast);
  const retryFn = useServerFn(retryFailedBroadcastRecipients);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["broadcast", id],
    queryFn: () => getFn({ data: { id } }),
    refetchInterval: (q) => {
      const d = q.state.data as { broadcast?: { status: string } } | undefined;
      return d?.broadcast?.status === "completed" ? false : 3000;
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`bcast-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "broadcast_recipients", filter: `broadcast_id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["broadcast", id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, qc]);

  const retry = useMutation({
    mutationFn: () => retryFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["broadcast", id] }),
  });

  if (!data) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const b = data.broadcast as {
    id: string;
    body: string;
    email_subject: string | null;
    channel: string;
    status: string;
    recipient_count: number;
    sent_count: number;
    failed_count: number;
    created_at: string;
    sent_by_name: string | null;
    recipient_filter_summary: string | null;
  };
  const recipients = data.recipients as Recipient[];
  const sent = recipients.filter((r) => r.status === "sent" || r.status === "delivered").length;
  const failed = recipients.filter((r) => r.status === "failed").length;
  const queued = recipients.filter((r) => r.status === "queued").length;
  const optedOut = recipients.filter((r) => (r.error_message ?? "").toLowerCase().includes("opt"))
    .length;
  const total = recipients.length;
  const progress = total === 0 ? 0 : Math.round(((sent + failed) / total) * 100);

  const exportCsv = () => {
    const rows = [
      ["Client name", "CLT ID", "Channel", "Status", "Recipient", "Error", "Created"].join(","),
      ...recipients.map((r) =>
        [
          r.client_name ?? "",
          r.client_id ?? "",
          r.channel,
          r.status,
          r.recipient ?? "",
          (r.error_message ?? "").replace(/,/g, ";"),
          r.created_at,
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `broadcast-${id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/inbox">
            <ArrowLeft className="mr-1.5 size-4" /> Back to inbox
          </Link>
        </Button>
        <div className="flex gap-2">
          {failed > 0 && (
            <Button size="sm" variant="outline" onClick={() => retry.mutate()}>
              <RefreshCw className="mr-1.5 size-3.5" /> Retry failed
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download className="mr-1.5 size-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="font-display text-xl">Broadcast delivery report</h1>
              <p className="text-xs text-muted-foreground">
                {format(new Date(b.created_at), "MMM d, yyyy h:mm a")} · by {b.sent_by_name} ·{" "}
                {b.recipient_filter_summary ?? ""}
              </p>
            </div>
            <Badge variant={b.status === "completed" ? "secondary" : "default"} className="capitalize">
              {b.status}
            </Badge>
          </div>

          {queued > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">
                Sending… {sent + failed} of {total}
              </div>
              <Progress value={progress} />
            </div>
          )}

          <div className="grid grid-cols-4 gap-3 text-sm">
            <Stat label="Total" value={total} />
            <Stat label="Delivered" value={sent} />
            <Stat label="Failed" value={failed - optedOut} />
            <Stat label="Opted out" value={optedOut} />
          </div>

          <div className="rounded-md border border-dashed border-border/60 p-3 bg-muted/30">
            {b.email_subject && <div className="font-medium text-sm mb-1">{b.email_subject}</div>}
            <div className="text-sm whitespace-pre-wrap">{b.body}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3">Client</th>
                <th className="text-left p-3">Channel</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">When</th>
              </tr>
            </thead>
            <tbody>
              {recipients.map((r) => (
                <tr key={r.id} className="border-t border-border/60">
                  <td className="p-3">
                    <div>{r.client_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.recipient ?? ""}</div>
                  </td>
                  <td className="p-3 uppercase text-xs">{r.channel}</td>
                  <td className="p-3">
                    <StatusBadge status={r.status} error={r.error_message} />
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {format(new Date(r.created_at), "MMM d, h:mm a")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border/60 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

function StatusBadge({ status, error }: { status: string; error: string | null }) {
  const opt = (error ?? "").toLowerCase().includes("opt");
  if (opt) return <Badge variant="outline">Opted Out</Badge>;
  if (status === "sent" || status === "delivered")
    return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Delivered</Badge>;
  if (status === "failed")
    return (
      <span className="inline-flex flex-col">
        <Badge variant="destructive">Failed</Badge>
        {error && <span className="text-[10px] text-muted-foreground mt-0.5">{error}</span>}
      </span>
    );
  return <Badge variant="secondary">{status}</Badge>;
}
