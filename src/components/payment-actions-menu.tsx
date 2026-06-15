import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MoreHorizontal, Ban, RotateCcw, AlertTriangle, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { useVerifiedAction } from "@/components/verification-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Database } from "@/integrations/supabase/types";

type Payment = Database["public"]["Tables"]["payments"]["Row"];
type ActionKind =
  | "void"
  | "refund"
  | "partial_refund"
  | "mark_disputed"
  | "resolve_dispute";

const MANUAL_NOTE = "Manual action — return cash/check to client directly and confirm below.";

export function PaymentActionsMenu({
  payment,
  onChanged,
}: {
  payment: Payment;
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState<ActionKind | null>(null);
  const isCard = payment.method === "credit_card";
  const isTerminal =
    payment.status === "voided" ||
    payment.status === "refunded" ||
    payment.status === "lost";
  const canVoid =
    payment.status === "completed" || payment.status === "pending";
  const canRefund =
    payment.status === "completed" || payment.status === "partially_refunded";
  const canDispute = isCard && !isTerminal && payment.status !== "disputed";
  const canResolve = payment.status === "disputed";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuLabel>Payment actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {canVoid && (
            <DropdownMenuItem onSelect={() => setOpen("void")}>
              <Ban className="mr-2 h-4 w-4" /> Void
            </DropdownMenuItem>
          )}
          {canRefund && (
            <>
              <DropdownMenuItem onSelect={() => setOpen("refund")}>
                <RotateCcw className="mr-2 h-4 w-4" /> Full refund
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setOpen("partial_refund")}>
                <RotateCcw className="mr-2 h-4 w-4" /> Partial refund
              </DropdownMenuItem>
            </>
          )}
          {canDispute && (
            <DropdownMenuItem onSelect={() => setOpen("mark_disputed")}>
              <AlertTriangle className="mr-2 h-4 w-4" /> Mark disputed
            </DropdownMenuItem>
          )}
          {canResolve && (
            <DropdownMenuItem onSelect={() => setOpen("resolve_dispute")}>
              <Check className="mr-2 h-4 w-4" /> Resolve dispute
            </DropdownMenuItem>
          )}
          {!canVoid && !canRefund && !canDispute && !canResolve && (
            <DropdownMenuItem disabled>No actions available</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {open === "void" && (
        <VoidDialog payment={payment} onClose={() => setOpen(null)} onDone={onChanged} />
      )}
      {(open === "refund" || open === "partial_refund") && (
        <RefundDialog
          payment={payment}
          mode={open === "refund" ? "full" : "partial"}
          onClose={() => setOpen(null)}
          onDone={onChanged}
        />
      )}
      {open === "mark_disputed" && (
        <DisputeDialog payment={payment} onClose={() => setOpen(null)} onDone={onChanged} />
      )}
      {open === "resolve_dispute" && (
        <ResolveDisputeDialog
          payment={payment}
          onClose={() => setOpen(null)}
          onDone={onChanged}
        />
      )}
    </>
  );
}

function ManualNotice({ method }: { method: string }) {
  if (method === "cash" || method === "check") {
    return (
      <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200">
        {MANUAL_NOTE}
      </p>
    );
  }
  if (method === "credit_card") {
    return (
      <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200">
        QuickBooks Payments is not connected. This will be recorded as a manual
        adjustment only. Connect QuickBooks in Settings to process card actions
        through the processor.
      </p>
    );
  }
  return null;
}

async function recordAction(input: {
  paymentId: string;
  action:
    | "manual_void"
    | "manual_refund"
    | "void"
    | "refund"
    | "partial_refund"
    | "dispute_opened"
    | "dispute_won"
    | "dispute_lost";
  amountCents?: number;
  reason?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("payment_actions").insert({
    payment_id: input.paymentId,
    action: input.action,
    amount_cents: input.amountCents ?? null,
    reason: input.reason ?? null,
    notes: input.notes ?? null,
    performed_by: user?.id ?? null,
    metadata: (input.metadata ?? {}) as never,
  });
  if (error) throw error;
}

function VoidDialog({
  payment,
  onClose,
  onDone,
}: {
  payment: Payment;
  onClose: () => void;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const verify = useVerifiedAction();
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      if (!reason.trim()) throw new Error("Reason is required");
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("payments")
        .update({
          status: "voided",
          voided_at: new Date().toISOString(),
          voided_by: user?.id ?? null,
          void_reason: reason.trim(),
        })
        .eq("id", payment.id);
      if (error) throw error;
      await recordAction({
        paymentId: payment.id,
        action: payment.method === "credit_card" ? "void" : "manual_void",
        amountCents: Math.round(Number(payment.amount) * 100),
        reason: reason.trim(),
        notes: notes.trim() || undefined,
      });
      await logAudit({
        action: "void",
        module: "payment",
        recordId: payment.id,
        recordLabel: `$${payment.amount}`,
        summary: `Payment voided: ${reason.trim()}`,
      });
    },
    onSuccess: () => {
      toast.success("Payment voided");
      qc.invalidateQueries({ queryKey: ["payments"] });
      onDone?.();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {verify.gate}
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Void payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <ManualNotice method={payment.method} />
          <p className="text-sm text-muted-foreground">
            Voiding excludes ${Number(payment.amount).toLocaleString()} from totals
            but keeps the record for audit.
          </p>
          <div>
            <Label>Reason (required)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || mut.isPending}
            onClick={() =>
              verify.run(() => mut.mutate(), {
                reason: "Verify your identity to void this payment.",
              })
            }
          >
            <Ban className="mr-2 h-4 w-4" /> Void payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RefundDialog({
  payment,
  mode,
  onClose,
  onDone,
}: {
  payment: Payment;
  mode: "full" | "partial";
  onClose: () => void;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const verify = useVerifiedAction();
  const amountCents = Math.round(Number(payment.amount) * 100);
  const alreadyRefunded = payment.refunded_amount_cents ?? 0;
  const remainingCents = Math.max(0, amountCents - alreadyRefunded);
  const [amount, setAmount] = useState(
    (mode === "full" ? remainingCents / 100 : 0).toFixed(2),
  );
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      if (!reason.trim()) throw new Error("Reason is required");
      const cents = Math.round(parseFloat(amount) * 100);
      if (!Number.isFinite(cents) || cents <= 0) throw new Error("Invalid amount");
      if (cents > remainingCents) throw new Error("Amount exceeds remaining balance");
      const newRefunded = alreadyRefunded + cents;
      const newStatus = newRefunded >= amountCents ? "refunded" : "partially_refunded";
      const { error } = await supabase
        .from("payments")
        .update({
          status: newStatus,
          refunded_amount_cents: newRefunded,
          refund_reason: reason.trim(),
        })
        .eq("id", payment.id);
      if (error) throw error;
      await recordAction({
        paymentId: payment.id,
        action:
          payment.method === "credit_card"
            ? newStatus === "refunded" ? "refund" : "partial_refund"
            : "manual_refund",
        amountCents: cents,
        reason: reason.trim(),
        notes: notes.trim() || undefined,
      });
      await logAudit({
        action: "update",
        module: "payment",
        recordId: payment.id,
        recordLabel: `$${(cents / 100).toFixed(2)}`,
        summary: `Refund $${(cents / 100).toFixed(2)} — ${reason.trim()}`,
      });
    },
    onSuccess: () => {
      toast.success("Refund recorded");
      qc.invalidateQueries({ queryKey: ["payments"] });
      onDone?.();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {verify.gate}
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {mode === "full" ? "Full refund" : "Partial refund"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <ManualNotice method={payment.method} />
          <p className="text-sm text-muted-foreground">
            Original ${(amountCents / 100).toFixed(2)} · Already refunded $
            {(alreadyRefunded / 100).toFixed(2)} · Remaining $
            {(remainingCents / 100).toFixed(2)}
          </p>
          <div>
            <Label>Refund amount ($)</Label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={mode === "full"}
            />
          </div>
          <div>
            <Label>Reason (required)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!reason.trim() || mut.isPending}
            onClick={() =>
              verify.run(() => mut.mutate(), {
                reason: "Verify your identity to issue this refund.",
              })
            }
          >
            <RotateCcw className="mr-2 h-4 w-4" /> Issue refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DisputeDialog({
  payment,
  onClose,
  onDone,
}: {
  payment: Payment;
  onClose: () => void;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const verify = useVerifiedAction();
  const amountCents = Math.round(Number(payment.amount) * 100);
  const [openedAt, setOpenedAt] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState((amountCents / 100).toFixed(2));
  const [deadline, setDeadline] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      if (!reason.trim()) throw new Error("Reason is required");
      const cents = Math.round(parseFloat(amount) * 100);
      const { error } = await supabase
        .from("payments")
        .update({
          status: "disputed",
          dispute_opened_at: new Date(openedAt).toISOString(),
          dispute_amount_cents: cents,
          dispute_deadline: deadline || null,
          dispute_reason: reason.trim(),
          dispute_notes: notes.trim() || null,
        })
        .eq("id", payment.id);
      if (error) throw error;
      await recordAction({
        paymentId: payment.id,
        action: "dispute_opened",
        amountCents: cents,
        reason: reason.trim(),
        notes: notes.trim() || undefined,
        metadata: { opened_at: openedAt, deadline: deadline || null },
      });
      await logAudit({
        action: "update",
        module: "payment",
        recordId: payment.id,
        recordLabel: `$${(cents / 100).toFixed(2)}`,
        summary: `Dispute opened — ${reason.trim()}`,
      });
    },
    onSuccess: () => {
      toast.success("Marked as disputed");
      qc.invalidateQueries({ queryKey: ["payments"] });
      onDone?.();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {verify.gate}
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Mark as disputed</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Opened on</Label>
              <Input type="date" value={openedAt} onChange={(e) => setOpenedAt(e.target.value)} />
            </div>
            <div>
              <Label>Response deadline</Label>
              <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Disputed amount ($)</Label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <Label>Reason (required)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!reason.trim() || mut.isPending}
            onClick={() =>
              verify.run(() => mut.mutate(), {
                reason: "Verify your identity to mark this payment disputed.",
              })
            }
          >
            <AlertTriangle className="mr-2 h-4 w-4" /> Mark disputed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResolveDisputeDialog({
  payment,
  onClose,
  onDone,
}: {
  payment: Payment;
  onClose: () => void;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const verify = useVerifiedAction();
  const [outcome, setOutcome] = useState<"won" | "lost">("won");
  const [notes, setNotes] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      const newStatus = outcome === "won" ? "completed" : "lost";
      const { error } = await supabase
        .from("payments")
        .update({
          status: newStatus,
          dispute_outcome: outcome,
          dispute_notes: notes.trim() || payment.dispute_notes,
        })
        .eq("id", payment.id);
      if (error) throw error;
      await recordAction({
        paymentId: payment.id,
        action: outcome === "won" ? "dispute_won" : "dispute_lost",
        amountCents: payment.dispute_amount_cents ?? Math.round(Number(payment.amount) * 100),
        notes: notes.trim() || undefined,
      });
      await logAudit({
        action: "update",
        module: "payment",
        recordId: payment.id,
        recordLabel: `$${payment.amount}`,
        summary: `Dispute ${outcome}`,
      });
    },
    onSuccess: () => {
      toast.success(`Dispute ${outcome}`);
      qc.invalidateQueries({ queryKey: ["payments"] });
      onDone?.();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {verify.gate}
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Resolve dispute</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Outcome</Label>
            <Select value={outcome} onValueChange={(v) => setOutcome(v as "won" | "lost")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="won">Won — funds remain</SelectItem>
                <SelectItem value="lost">Lost — funds reversed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={mut.isPending}
            onClick={() =>
              verify.run(() => mut.mutate(), {
                reason: "Verify your identity to resolve this dispute.",
              })
            }
          >
            {outcome === "won" ? <Check className="mr-2 h-4 w-4" /> : <X className="mr-2 h-4 w-4" />}
            Resolve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
