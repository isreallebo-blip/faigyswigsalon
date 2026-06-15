import { Badge } from "@/components/ui/badge";
import type { Database } from "@/integrations/supabase/types";

export type PaymentStatus = Database["public"]["Enums"]["payment_status"];

const LABELS: Record<PaymentStatus, string> = {
  completed: "Completed",
  pending: "Pending",
  voided: "Voided",
  refunded: "Refunded",
  partially_refunded: "Partial refund",
  disputed: "Disputed",
  lost: "Dispute lost",
  failed: "Failed",
};

const CLASSES: Record<PaymentStatus, string> = {
  completed: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  pending: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300",
  voided: "bg-muted text-muted-foreground border-border line-through",
  refunded: "bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-300",
  partially_refunded: "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-300",
  disputed: "bg-amber-500/20 text-amber-800 border-amber-500/40 dark:text-amber-200",
  lost: "bg-destructive/15 text-destructive border-destructive/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
};

export function PaymentStatusBadge({
  status,
  refundedCents,
  amountCents,
}: {
  status: PaymentStatus;
  refundedCents?: number | null;
  amountCents?: number | null;
}) {
  const label =
    status === "partially_refunded" && refundedCents && amountCents
      ? `Partial refund · $${(refundedCents / 100).toFixed(2)} of $${(amountCents / 100).toFixed(2)}`
      : LABELS[status];
  return (
    <Badge variant="outline" className={`border ${CLASSES[status]}`}>
      {label}
    </Badge>
  );
}
