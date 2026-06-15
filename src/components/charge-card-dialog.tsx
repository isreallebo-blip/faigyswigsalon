// Quick "Charge Card" modal opened from the client profile header.
// Captures amount + description, runs the standard charge flow, and on
// success creates a linked `payments` row so the charge shows up in the
// bank register and client timeline alongside other payments.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardChargeSection, type ChargeResult } from "@/components/card-charge-section";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";

export function ChargeCardDialog({
  clientId,
  clientName,
  trigger,
}: {
  clientId: string;
  clientName?: string;
  trigger?: React.ReactNode;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amountStr, setAmountStr] = useState("");
  const [description, setDescription] = useState("");
  const [receipt, setReceipt] = useState<ChargeResult | null>(null);

  const amountCents = Math.round(parseFloat(amountStr || "0") * 100);

  const finalize = useMutation({
    mutationFn: async (r: ChargeResult) => {
      const { data, error } = await supabase
        .from("payments")
        .insert({
          client_id: clientId,
          date: format(new Date(), "yyyy-MM-dd"),
          amount: r.amountCents / 100,
          method: "credit_card",
          category: "other",
          description: description.trim() || null,
          payment_transaction_id: r.transactionId,
        })
        .select()
        .single();
      if (error) throw error;
      await logAudit({
        action: "create",
        module: "payment",
        recordId: data.id,
        summary: `Card charge of $${(r.amountCents / 100).toFixed(2)} (charge ${r.chargeId})`,
        after: data as unknown as Record<string, unknown>,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Saved charge but payment row failed"),
  });

  const onCharged = async (r: ChargeResult) => {
    setReceipt(r);
    await finalize.mutateAsync(r);
  };

  const reset = () => {
    setReceipt(null);
    setAmountStr("");
    setDescription("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="gap-1">
            <CreditCard className="h-4 w-4" /> Charge Card
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            Charge card{clientName ? ` — ${clientName}` : ""}
          </DialogTitle>
        </DialogHeader>

        {receipt ? (
          <div className="space-y-3">
            <div className="rounded-md border bg-emerald-50 dark:bg-emerald-950 p-3 text-sm space-y-1">
              <p className="text-emerald-700 dark:text-emerald-200 font-medium">
                ✅ Charged ${(receipt.amountCents / 100).toFixed(2)} to {receipt.brand ?? "card"} ending in{" "}
                {receipt.last4 ?? "????"}
              </p>
              <p className="text-xs">
                QuickBooks Charge ID: <code className="font-mono">{receipt.chargeId}</code>
              </p>
              {receipt.intuitTid && (
                <p className="text-xs">
                  Transaction ID (TID): <code className="font-mono">{receipt.intuitTid}</code>
                </p>
              )}
              {receipt.authCode && (
                <p className="text-xs">
                  Auth code: <code className="font-mono">{receipt.authCode}</code>
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={reset}>
                Charge another
              </Button>
              <Button size="sm" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Amount ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Description / service</Label>
                <Input
                  placeholder="Cut & wash"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
            <CardChargeSection
              clientId={clientId}
              amountCents={amountCents}
              description={description}
              onCharged={onCharged}
              disabled={amountCents <= 0}
              triggerLabel="Charge"
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
