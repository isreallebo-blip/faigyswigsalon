import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, XCircle } from "lucide-react";
import { getReceiptByToken } from "@/lib/intuit.functions";

export const Route = createFileRoute("/receipt/$token")({
  head: () => ({
    meta: [
      { title: "Payment Receipt — Faigy's Wig Salon" },
      { name: "description", content: "View your payment receipt." },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-lg p-8 text-center text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-lg p-8 text-center text-sm text-muted-foreground">Receipt not found.</div>
  ),
  component: ReceiptPage,
});

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function ReceiptPage() {
  const { token } = Route.useParams();
  const fetcher = useServerFn(getReceiptByToken);
  const q = useQuery({
    queryKey: ["receipt", token],
    queryFn: () => fetcher({ data: { token } }),
  });

  if (q.isLoading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading receipt…</div>;
  if (!q.data) return <div className="p-8 text-center text-sm text-muted-foreground">Receipt not found.</div>;

  const r = q.data;
  const captured = r.status?.toLowerCase() === "captured" || r.status?.toLowerCase() === "succeeded";
  const refunded = (r.refundedCents ?? 0) > 0;

  return (
    <main className="mx-auto max-w-lg p-4 sm:p-8">
      <Card className="border-2">
        <CardHeader className="text-center">
          <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            {r.salonName}
          </div>
          <CardTitle className="font-display text-3xl">Payment Receipt</CardTitle>
          {captured ? (
            <Badge variant="default" className="mx-auto gap-1 w-fit">
              <CheckCircle2 className="h-3 w-3" /> {r.status}
            </Badge>
          ) : (
            <Badge variant="destructive" className="mx-auto gap-1 w-fit">
              <XCircle className="h-3 w-3" /> {r.status}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center">
            <div className="font-display text-5xl tabular-nums">
              {money(r.amountCents, r.currency)}
            </div>
            {refunded && (
              <div className="text-sm text-destructive mt-1">
                Refunded: {money(r.refundedCents, r.currency)}
              </div>
            )}
          </div>
          <Separator />
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Date</dt>
            <dd className="text-right">{new Date(r.createdAt).toLocaleString()}</dd>

            {r.clientName && (
              <>
                <dt className="text-muted-foreground">Paid by</dt>
                <dd className="text-right">{r.clientName}</dd>
              </>
            )}

            {r.cardBrand && r.last4 && (
              <>
                <dt className="text-muted-foreground">Payment method</dt>
                <dd className="text-right capitalize">
                  {r.cardBrand} •••• {r.last4}
                </dd>
              </>
            )}

            {r.description && (
              <>
                <dt className="text-muted-foreground">Description</dt>
                <dd className="text-right">{r.description}</dd>
              </>
            )}

            <dt className="text-muted-foreground">Transaction ID</dt>
            <dd className="text-right font-mono text-[10px] break-all">{r.id}</dd>
          </dl>

          {(r.salonAddress || r.salonPhone) && (
            <>
              <Separator />
              <div className="text-center text-xs text-muted-foreground space-y-0.5">
                {r.salonAddress && <div>{r.salonAddress}</div>}
                {r.salonPhone && <div>{r.salonPhone}</div>}
              </div>
            </>
          )}

          <p className="text-center text-[11px] text-muted-foreground pt-2">
            Payments are processed securely through QuickBooks Payments. We never store full card
            numbers or security codes.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
