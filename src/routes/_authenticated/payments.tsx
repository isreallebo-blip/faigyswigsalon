import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { Plus, Wallet, Ban, Link2, Banknote, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { triggerNotificationFn, formatDateClient } from "@/lib/notifications/client";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClientSelect } from "@/components/client-select";

type Payment = Database["public"]["Tables"]["payments"]["Row"];
type BankAccount = Database["public"]["Tables"]["bank_accounts"]["Row"];
type BankTxn = Database["public"]["Tables"]["bank_transactions"]["Row"];
type PaymentMethod = Database["public"]["Enums"]["payment_method"];
type PaymentCategory = Database["public"]["Enums"]["payment_category"];
type AccountType = Database["public"]["Enums"]["bank_account_type"];

const METHODS: PaymentMethod[] = ["cash", "check", "credit_card", "zelle", "other"];
const CATEGORIES: PaymentCategory[] = ["wig_sale", "cut", "wash_set", "repair", "other"];

const paymentSchema = z.object({
  client_id: z.string().uuid().nullable().optional(),
  bank_account_id: z.string().uuid().nullable().optional(),
  date: z.string().min(1),
  amount: z.coerce.number().min(0.01),
  method: z.enum(["cash", "check", "credit_card", "zelle", "other"]),
  category: z.enum(["wig_sale", "cut", "wash_set", "repair", "other"]),
  description: z.string().optional(),
});

const accountSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["bank", "cc_processor"]),
  starting_balance: z.coerce.number(),
});

const txnSchema = z.object({
  bank_account_id: z.string().uuid(),
  date: z.string().min(1),
  amount: z.coerce.number(),
  description: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({ meta: [{ title: "Payments — Faigy's Wig Salon" }] }),
  component: PaymentsPage,
});

function PaymentsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Money</p>
        <h1 className="mt-1 font-display text-4xl">Payments & bank register</h1>
      </div>

      <Tabs defaultValue="payments">
        <TabsList>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="register">Bank register</TabsTrigger>
          <TabsTrigger value="reconcile">Reconcile</TabsTrigger>
        </TabsList>
        <TabsContent value="payments" className="mt-4"><PaymentsTab /></TabsContent>
        <TabsContent value="register" className="mt-4"><RegisterTab /></TabsContent>
        <TabsContent value="reconcile" className="mt-4"><ReconcileTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function PaymentsTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);

  const accounts = useQuery({
    queryKey: ["bank_accounts", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bank_accounts").select("*").order("name");
      if (error) throw error;
      return data as BankAccount[];
    },
  });

  const list = useQuery({
    queryKey: ["payments", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*, client:client_id(full_name, display_id), account:bank_account_id(name)")
        .order("date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as (Payment & {
        client: { full_name: string; display_id: string } | null;
        account: { name: string } | null;
      })[];
    },
  });

  const total = useMemo(() => (list.data ?? []).filter((p) => !p.voided_at).reduce((s, p) => s + Number(p.amount), 0), [list.data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Total shown: <span className="font-medium text-foreground">${total.toLocaleString()}</span>
        </div>
        <Dialog open={open || !!editing} onOpenChange={(o) => { if (!o) { setOpen(false); setEditing(null); } }}>
          <DialogTrigger asChild>
            <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Record payment</Button>
          </DialogTrigger>
          <PaymentDialog
            payment={editing}
            accounts={accounts.data ?? []}
            onClose={() => { setOpen(false); setEditing(null); }}
            onSaved={() => { qc.invalidateQueries({ queryKey: ["payments"] }); setOpen(false); setEditing(null); }}
          />
        </Dialog>
      </div>

      {list.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : !list.data?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <Wallet className="mx-auto h-6 w-6 text-gold" />
            <p className="mt-3 font-display text-lg text-foreground">No payments recorded yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {list.data.map((p) => (
            <button key={p.id} onClick={() => setEditing(p)} className="w-full text-left">
              <Card className={`transition hover:border-gold ${p.voided_at ? "opacity-60" : ""}`}>
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="capitalize">{p.category.replace("_", " ")}</Badge>
                      {p.voided_at && <Badge variant="destructive">Voided</Badge>}
                      <span className={`font-medium ${p.voided_at ? "line-through" : ""}`}>{p.client?.full_name ?? "—"}</span>
                      {p.client?.display_id && <span className="font-mono text-[10px] text-muted-foreground">{p.client.display_id}</span>}
                      <span className="text-xs text-muted-foreground capitalize">· {p.method.replace("_", " ")}</span>
                      {p.account && <span className="text-xs text-muted-foreground">→ {p.account.name}</span>}
                    </div>
                    {p.description && <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{p.description}</p>}
                    {p.void_reason && <p className="mt-1 text-xs text-destructive">Void reason: {p.void_reason}</p>}
                  </div>
                  <div className="text-right">
                    <div className={`font-display text-xl tabular-nums ${p.voided_at ? "line-through" : ""}`}>${Number(p.amount).toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">{format(new Date(p.date), "MMM d, yyyy")}</div>
                  </div>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PaymentDialog({
  payment, accounts, onClose, onSaved,
}: {
  payment: Payment | null;
  accounts: BankAccount[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useForm<z.infer<typeof paymentSchema>>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      client_id: payment?.client_id ?? null,
      bank_account_id: payment?.bank_account_id ?? null,
      date: payment?.date ?? format(new Date(), "yyyy-MM-dd"),
      amount: payment?.amount ? Number(payment.amount) : 0,
      method: payment?.method ?? "cash",
      category: payment?.category ?? "wig_sale",
      description: payment?.description ?? "",
    },
  });

  const [voidReason, setVoidReason] = useState("");

  const save = useMutation({
    mutationFn: async (v: z.infer<typeof paymentSchema>) => {
      const payload = {
        client_id: v.client_id || null,
        bank_account_id: v.bank_account_id || null,
        date: v.date,
        amount: v.amount,
        method: v.method,
        category: v.category,
        description: v.description || null,
      };
      if (payment) {
        const { data, error } = await supabase.from("payments").update(payload).eq("id", payment.id).select().single();
        if (error) throw error;
        await logAudit({
          action: "update", module: "payment", recordId: payment.id,
          recordLabel: `$${payment.amount} on ${payment.date}`,
          summary: "Payment updated",
          before: payment as unknown as Record<string, unknown>,
          after: data as unknown as Record<string, unknown>,
        });
      } else {
        const { data, error } = await supabase.from("payments").insert(payload).select().single();
        if (error) throw error;
        await logAudit({
          action: "create", module: "payment", recordId: data.id,
          recordLabel: `$${data.amount} on ${data.date}`,
          summary: `Payment of $${data.amount} recorded`,
          after: data as unknown as Record<string, unknown>,
        });
        if (data.client_id) {
          const amountStr = `${Number(data.amount).toFixed(2)}`;
          const dateStr = formatDateClient(data.date);
          // Look up client name + balance for the receipt
          const [{ data: clientRow }, { data: history }] = await Promise.all([
            supabase.from("clients").select("full_name, display_id").eq("id", data.client_id).maybeSingle(),
            supabase.from("payments").select("amount").eq("client_id", data.client_id).is("voided_at", null),
          ]);
          const balance = (history ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0);
          // Short SMS confirmation
          await triggerNotificationFn({ data: {
            clientId: data.client_id, templateKey: "payment_received",
            vars: { amount: amountStr, date: dateStr },
            idempotencyKey: `pay-recv-${data.id}`,
          }}).catch(() => {});
          // Formatted email receipt
          await triggerNotificationFn({ data: {
            clientId: data.client_id, templateKey: "payment_receipt",
            idempotencyKey: `pay-receipt-${data.id}`,
            receiptData: {
              clientName: clientRow?.full_name ?? "",
              cltId: clientRow?.display_id ?? "",
              date: dateStr,
              hebrewDate: "",
              amount: `$${amountStr}`,
              method: data.method ?? "",
              description: data.description ?? "",
              balance: balance > 0 ? `$${balance.toFixed(2)}` : undefined,
            },
          }}).catch(() => {});
        }
      }
    },
    onSuccess: () => { toast.success("Saved"); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const voidPayment = useMutation({
    mutationFn: async () => {
      if (!payment) return;
      if (!voidReason.trim()) throw new Error("Void reason is required");
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("payments")
        .update({ voided_at: new Date().toISOString(), voided_by: user?.id ?? null, void_reason: voidReason.trim() })
        .eq("id", payment.id).select().single();
      if (error) throw error;
      await logAudit({
        action: "void", module: "payment", recordId: payment.id,
        recordLabel: `$${payment.amount} on ${payment.date}`,
        summary: `Payment voided: ${voidReason.trim()}`,
        before: payment as unknown as Record<string, unknown>,
        after: data as unknown as Record<string, unknown>,
      });
    },
    onSuccess: () => { toast.success("Payment voided"); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader><DialogTitle className="font-display text-2xl">{payment ? "Edit payment" : "Record payment"}</DialogTitle></DialogHeader>
      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
        <div>
          <Label>Client</Label>
          <ClientSelect value={form.watch("client_id") ?? null} onChange={(id) => form.setValue("client_id", id)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Date</Label>
            <Input type="date" {...form.register("date")} />
          </div>
          <div>
            <Label>Amount ($)</Label>
            <Input type="number" step="0.01" {...form.register("amount")} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Method</Label>
            <Select value={form.watch("method")} onValueChange={(v) => form.setValue("method", v as PaymentMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Category</Label>
            <Select value={form.watch("category")} onValueChange={(v) => form.setValue("category", v as PaymentCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Deposit account (optional)</Label>
          <Select
            value={form.watch("bank_account_id") ?? "__none__"}
            onValueChange={(v) => form.setValue("bank_account_id", v === "__none__" ? null : v)}
          >
            <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— None —</SelectItem>
              {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Description</Label>
          <Textarea rows={2} {...form.register("description")} />
        </div>
        {payment && !payment.voided_at && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
            <Label className="text-destructive">Void this payment</Label>
            <p className="text-xs text-muted-foreground">Payments are never deleted. Voiding excludes them from totals but keeps the record for audit.</p>
            <Input placeholder="Reason (required)" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
          </div>
        )}
        {payment?.voided_at && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            Voided on {format(new Date(payment.voided_at), "MMM d, yyyy HH:mm")} — {payment.void_reason}
          </div>
        )}
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <div>
            {payment && !payment.voided_at && (
              <Button type="button" variant="ghost" onClick={() => voidPayment.mutate()} disabled={!voidReason.trim() || voidPayment.isPending} className="text-destructive gap-2">
                <Ban className="h-4 w-4" /> Void
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={save.isPending || !!payment?.voided_at}>Save</Button>
          </div>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function RegisterTab() {
  const qc = useQueryClient();
  const [openAcct, setOpenAcct] = useState(false);
  const [openTxn, setOpenTxn] = useState(false);
  const [activeAcct, setActiveAcct] = useState<string | null>(null);

  const accounts = useQuery({
    queryKey: ["bank_accounts", "list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bank_accounts").select("*").order("name");
      if (error) throw error;
      return data as BankAccount[];
    },
  });

  const txns = useQuery({
    queryKey: ["bank_transactions", activeAcct],
    enabled: !!activeAcct,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_transactions")
        .select("*")
        .eq("bank_account_id", activeAcct!)
        .order("date", { ascending: false });
      if (error) throw error;
      return data as BankTxn[];
    },
  });

  const payments = useQuery({
    queryKey: ["payments", "by-account", activeAcct],
    enabled: !!activeAcct,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, date, amount, description, client:client_id(full_name)")
        .eq("bank_account_id", activeAcct!)
        .is("voided_at", null)
        .order("date", { ascending: false });
      if (error) throw error;
      return data as (Payment & { client: { full_name: string } | null })[];
    },
  });

  const balance = useMemo(() => {
    const acct = accounts.data?.find((a) => a.id === activeAcct);
    if (!acct) return 0;
    const txnSum = (txns.data ?? []).reduce((s, t) => s + Number(t.amount), 0);
    const paySum = (payments.data ?? []).reduce((s, p) => s + Number(p.amount), 0);
    return Number(acct.starting_balance) + txnSum + paySum;
  }, [accounts.data, txns.data, payments.data, activeAcct]);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="space-y-3 md:col-span-1">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl">Accounts</h2>
          <Dialog open={openAcct} onOpenChange={setOpenAcct}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1"><Plus className="h-4 w-4" /> Add</Button>
            </DialogTrigger>
            <AccountDialog onClose={() => setOpenAcct(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ["bank_accounts"] }); setOpenAcct(false); }} />
          </Dialog>
        </div>
        {accounts.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !accounts.data?.length ? (
          <p className="text-sm text-muted-foreground">No accounts yet.</p>
        ) : (
          accounts.data.map((a) => (
            <button
              key={a.id}
              onClick={() => setActiveAcct(a.id)}
              className={`w-full rounded-lg border p-3 text-left transition ${activeAcct === a.id ? "border-gold bg-card" : "border-border hover:border-gold"}`}
            >
              <div className="flex items-center gap-2">
                {a.type === "cc_processor" ? <CreditCard className="h-4 w-4 text-gold" /> : <Banknote className="h-4 w-4 text-gold" />}
                <span className="font-medium">{a.name}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground capitalize">{a.type.replace("_", " ")}</p>
            </button>
          ))
        )}
      </div>

      <div className="md:col-span-2">
        {!activeAcct ? (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Select an account to view its register.</CardContent></Card>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="font-display text-2xl">{accounts.data?.find((a) => a.id === activeAcct)?.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">Running balance</p>
                </div>
                <div className="text-right">
                  <div className="font-display text-3xl tabular-nums">${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                </div>
              </CardHeader>
              <CardContent className="flex justify-end">
                <Dialog open={openTxn} onOpenChange={setOpenTxn}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Manual entry</Button>
                  </DialogTrigger>
                  <TxnDialog
                    accountId={activeAcct}
                    onClose={() => setOpenTxn(false)}
                    onSaved={() => { qc.invalidateQueries({ queryKey: ["bank_transactions"] }); setOpenTxn(false); }}
                  />
                </Dialog>
              </CardContent>
            </Card>

            <div>
              <h3 className="mb-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">Recent activity</h3>
              <div className="space-y-2">
                {[...(payments.data ?? []).map((p) => ({
                  id: `p-${p.id}`, date: p.date, amount: Number(p.amount),
                  desc: `${p.client?.full_name ?? "Client"} payment${p.description ? ` — ${p.description}` : ""}`, type: "payment" as const,
                })),
                ...(txns.data ?? []).map((t) => ({
                  id: `t-${t.id}`, date: t.date, amount: Number(t.amount),
                  desc: t.description ?? "Bank transaction", type: "txn" as const,
                }))]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .slice(0, 50)
                  .map((row) => (
                    <Card key={row.id}>
                      <CardContent className="flex items-center justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant={row.type === "payment" ? "secondary" : "outline"} className="capitalize">{row.type === "payment" ? "Payment" : "Manual"}</Badge>
                            <span className="truncate text-sm">{row.desc}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{format(new Date(row.date), "MMM d, yyyy")}</p>
                        </div>
                        <div className={`tabular-nums ${row.amount >= 0 ? "text-foreground" : "text-destructive"}`}>
                          {row.amount >= 0 ? "+" : "−"}${Math.abs(row.amount).toLocaleString()}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                {!(payments.data?.length || txns.data?.length) && (
                  <p className="text-sm text-muted-foreground">No activity yet.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AccountDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const form = useForm<z.infer<typeof accountSchema>>({
    resolver: zodResolver(accountSchema),
    defaultValues: { name: "", type: "bank", starting_balance: 0 },
  });
  const save = useMutation({
    mutationFn: async (v: z.infer<typeof accountSchema>) => {
      const { error } = await supabase.from("bank_accounts").insert(v);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Account added"); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle className="font-display text-2xl">New account</DialogTitle></DialogHeader>
      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
        <div><Label>Name</Label><Input {...form.register("name")} /></div>
        <div>
          <Label>Type</Label>
          <Select value={form.watch("type")} onValueChange={(v) => form.setValue("type", v as AccountType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="bank">Bank account</SelectItem>
              <SelectItem value="cc_processor">Credit card processor</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Starting balance ($)</Label><Input type="number" step="0.01" {...form.register("starting_balance")} /></div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={save.isPending}>Save</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function TxnDialog({ accountId, onClose, onSaved }: { accountId: string; onClose: () => void; onSaved: () => void }) {
  const form = useForm<z.infer<typeof txnSchema>>({
    resolver: zodResolver(txnSchema),
    defaultValues: { bank_account_id: accountId, date: format(new Date(), "yyyy-MM-dd"), amount: 0, description: "" },
  });
  const save = useMutation({
    mutationFn: async (v: z.infer<typeof txnSchema>) => {
      const { error } = await supabase.from("bank_transactions").insert({
        bank_account_id: v.bank_account_id,
        date: v.date,
        amount: v.amount,
        description: v.description || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Entry added"); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle className="font-display text-2xl">Manual entry</DialogTitle></DialogHeader>
      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
        <div><Label>Date</Label><Input type="date" {...form.register("date")} /></div>
        <div><Label>Amount (negative for outflow)</Label><Input type="number" step="0.01" {...form.register("amount")} /></div>
        <div><Label>Description</Label><Textarea rows={2} {...form.register("description")} /></div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={save.isPending}>Save</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function ReconcileTab() {
  const qc = useQueryClient();

  const accounts = useQuery({
    queryKey: ["bank_accounts", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bank_accounts").select("*").order("name");
      if (error) throw error;
      return data as BankAccount[];
    },
  });

  const [acctId, setAcctId] = useState<string | null>(null);

  const unmatchedTxns = useQuery({
    queryKey: ["recon", "unmatched-txns", acctId],
    enabled: !!acctId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_transactions")
        .select("*")
        .eq("bank_account_id", acctId!)
        .eq("is_matched", false)
        .order("date", { ascending: false });
      if (error) throw error;
      return data as BankTxn[];
    },
  });

  const unmatchedPayments = useQuery({
    queryKey: ["recon", "unmatched-payments", acctId],
    enabled: !!acctId,
    queryFn: async () => {
      const { data: matched } = await supabase
        .from("bank_transactions")
        .select("matched_payment_id")
        .eq("bank_account_id", acctId!)
        .not("matched_payment_id", "is", null);
      const matchedIds = new Set((matched ?? []).map((m) => m.matched_payment_id));
      const { data, error } = await supabase
        .from("payments")
        .select("*, client:client_id(full_name)")
        .eq("bank_account_id", acctId!)
        .is("voided_at", null)
        .order("date", { ascending: false });
      if (error) throw error;
      return (data as (Payment & { client: { full_name: string } | null })[]).filter((p) => !matchedIds.has(p.id));
    },
  });

  const match = useMutation({
    mutationFn: async ({ txnId, paymentId }: { txnId: string; paymentId: string }) => {
      const { error } = await supabase
        .from("bank_transactions")
        .update({ matched_payment_id: paymentId, is_matched: true })
        .eq("id", txnId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Matched");
      qc.invalidateQueries({ queryKey: ["recon"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [selectedTxn, setSelectedTxn] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Label className="text-sm">Account:</Label>
        <Select value={acctId ?? ""} onValueChange={setAcctId}>
          <SelectTrigger className="w-72"><SelectValue placeholder="Select an account" /></SelectTrigger>
          <SelectContent>
            {accounts.data?.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!acctId ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Pick an account to reconcile.</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="font-display text-xl">Bank transactions (unmatched)</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {!unmatchedTxns.data?.length ? (
                <p className="text-sm text-muted-foreground">All bank transactions are matched.</p>
              ) : (
                unmatchedTxns.data.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTxn(t.id)}
                    className={`w-full rounded-lg border p-3 text-left transition ${selectedTxn === t.id ? "border-gold bg-card" : "border-border hover:border-gold"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{t.description ?? "—"}</span>
                      <span className="tabular-nums">${Number(t.amount).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{format(new Date(t.date), "MMM d, yyyy")}</p>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="font-display text-xl">Payments (unmatched)</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {!unmatchedPayments.data?.length ? (
                <p className="text-sm text-muted-foreground">All payments are matched.</p>
              ) : (
                unmatchedPayments.data.map((p) => (
                  <Card key={p.id}>
                    <CardContent className="flex items-center justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{p.client?.full_name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(p.date), "MMM d")} · ${Number(p.amount).toLocaleString()}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!selectedTxn}
                        onClick={() => selectedTxn && match.mutate({ txnId: selectedTxn, paymentId: p.id })}
                        className="gap-1"
                      >
                        <Link2 className="h-3 w-3" /> Match
                      </Button>
                    </CardContent>
                  </Card>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
