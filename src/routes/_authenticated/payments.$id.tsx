import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, ReceiptText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PaymentStatusBadge } from "@/components/payment-status-badge";
import { PaymentActionsMenu } from "@/components/payment-actions-menu";
import type { Database } from "@/integrations/supabase/types";

type Payment = Database["public"]["Tables"]["payments"]["Row"];
type Action = Database["public"]["Tables"]["payment_actions"]["Row"];
type Audit = Database["public"]["Tables"]["audit_logs"]["Row"];

export const Route = createFileRoute("/_authenticated/payments/$id")({
  head: () => ({ meta: [{ title: "Payment details — Faigy's Wig Salon" }] }),
  component: PaymentDetailPage,
});

function PaymentDetailPage() {
  const { id } = useParams({ from: "/_authenticated/payments/$id" });

  const payment = useQuery({
    queryKey: ["payment-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*, client:client_id(id, full_name, display_id), account:bank_account_id(name)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as
        | (Payment & {
            client: { id: string; full_name: string; display_id: string } | null;
            account: { name: string } | null;
          })
        | null;
    },
  });

  const actions = useQuery({
    queryKey: ["payment-actions", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_actions")
        .select("*")
        .eq("payment_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Action[];
    },
  });

  const audit = useQuery({
    queryKey: ["payment-audit", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("module", "payment")
        .eq("record_id", id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Audit[];
    },
  });

  if (payment.isLoading) return <Skeleton className="mx-auto h-64 max-w-4xl" />;
  if (!payment.data)
    return <p className="mx-auto max-w-4xl text-sm text-muted-foreground">Payment not found.</p>;

  const p = payment.data;
  const amountCents = Math.round(Number(p.amount) * 100);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild className="gap-1">
          <Link to="/payments"><ArrowLeft className="h-4 w-4" /> Back to payments</Link>
        </Button>
        <PaymentActionsMenu payment={p} onChanged={() => {
          payment.refetch(); actions.refetch(); audit.refetch();
        }} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Payment</p>
              <CardTitle className="font-display text-3xl">
                ${Number(p.amount).toLocaleString()}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {format(new Date(p.date), "MMM d, yyyy")} ·{" "}
                <span className="capitalize">{p.method.replace("_", " ")}</span>
              </p>
            </div>
            <PaymentStatusBadge
              status={p.status}
              refundedCents={p.refunded_amount_cents}
              amountCents={amountCents}
            />
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Client</p>
            {p.client ? (
              <p>
                {p.client.full_name}
                {p.client.display_id && (
                  <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                    {p.client.display_id}
                  </span>
                )}
              </p>
            ) : (
              <p className="text-muted-foreground">—</p>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Category</p>
            <p className="capitalize">{p.category.replace("_", " ")}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Deposit account</p>
            <p>{p.account?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Refunded</p>
            <p>${((p.refunded_amount_cents ?? 0) / 100).toFixed(2)}</p>
          </div>
          {p.description && (
            <div className="sm:col-span-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Description</p>
              <p>{p.description}</p>
            </div>
          )}
          {p.status === "disputed" && (
            <div className="sm:col-span-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-200">
                Open dispute
              </p>
              <p className="mt-1 text-sm">{p.dispute_reason}</p>
              <p className="text-xs text-muted-foreground">
                Opened {p.dispute_opened_at ? format(new Date(p.dispute_opened_at), "MMM d, yyyy") : "—"}
                {p.dispute_deadline && ` · Deadline ${format(new Date(p.dispute_deadline), "MMM d, yyyy")}`}
                {p.dispute_amount_cents != null && ` · $${(p.dispute_amount_cents / 100).toFixed(2)}`}
              </p>
              {p.dispute_notes && <p className="mt-1 text-xs">{p.dispute_notes}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-gold" /> Action history
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!actions.data?.length ? (
            <p className="text-sm text-muted-foreground">No actions yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {actions.data.map((a) => (
                <li key={a.id} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="capitalize">
                      {a.action.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(a.created_at), "MMM d, yyyy HH:mm")}
                    </span>
                  </div>
                  {a.amount_cents != null && (
                    <p className="mt-1">Amount: ${(a.amount_cents / 100).toFixed(2)}</p>
                  )}
                  {a.reason && <p className="mt-1 text-muted-foreground">Reason: {a.reason}</p>}
                  {a.notes && <p className="text-muted-foreground">Notes: {a.notes}</p>}
                  {a.intuit_tid && (
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                      TID: {a.intuit_tid}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">Audit log</CardTitle>
        </CardHeader>
        <CardContent>
          {!audit.data?.length ? (
            <p className="text-sm text-muted-foreground">No entries.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {audit.data.map((e) => (
                <li key={e.id} className="flex justify-between gap-2 border-b border-border/50 py-1">
                  <span>
                    <span className="font-medium capitalize">{e.action}</span> · {e.summary ?? ""}
                  </span>
                  <span className="text-muted-foreground">
                    {format(new Date(e.created_at), "MMM d, HH:mm")} · {e.user_name ?? e.user_email ?? "system"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
