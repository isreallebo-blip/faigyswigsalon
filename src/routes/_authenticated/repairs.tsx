import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { Plus, Wrench, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { triggerNotificationFn, formatDateClient } from "@/lib/notifications/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClientSelect } from "@/components/client-select";
import { VendorSelect } from "@/components/vendor-select";

type Repair = Database["public"]["Tables"]["repairs"]["Row"];
type RepairStatus = Database["public"]["Enums"]["repair_status"];

const STATUSES: RepairStatus[] = ["sent_to_vendor", "in_progress", "returned", "issue"];

const schema = z.object({
  client_id: z.string().uuid().nullable().optional(),
  vendor_id: z.string().uuid().nullable().optional(),
  vendor: z.string().min(1, "Vendor name required"),
  date_sent: z.string().min(1),
  expected_return: z.string().optional().nullable(),
  actual_return: z.string().optional().nullable(),
  cost: z.coerce.number().min(0).optional(),
  work_requested: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["sent_to_vendor", "in_progress", "returned", "issue"]),
});

export const Route = createFileRoute("/_authenticated/repairs")({
  head: () => ({ meta: [{ title: "Repairs — Faigy's Wig Salon" }] }),
  component: RepairsPage,
});

function RepairsPage() {
  const [tab, setTab] = useState<"open" | "done" | "all">("open");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Repair | null>(null);
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["repairs", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("repairs")
        .select("*, client:client_id(full_name, display_id), wig:wig_id(brand, style, wig_code, display_id), vendor_ref:vendor_id(name, display_id)")
        .order("date_sent", { ascending: false });
      if (error) throw error;
      return data as (Repair & {
        client: { full_name: string; display_id: string } | null;
        wig: { brand: string | null; style: string | null; wig_code: string | null; display_id: string } | null;
        vendor_ref: { name: string; display_id: string } | null;
      })[];
    },
  });

  const filtered = useMemo(() => {
    const all = list.data ?? [];
    if (tab === "all") return all;
    if (tab === "open") return all.filter((r) => r.status === "sent_to_vendor" || r.status === "in_progress" || r.status === "issue");
    return all.filter((r) => r.status === "returned");
  }, [list.data, tab]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Operations</p>
          <h1 className="mt-1 font-display text-4xl">Repairs</h1>
        </div>
        <Dialog open={open || !!editing} onOpenChange={(o) => { if (!o) { setOpen(false); setEditing(null); } }}>
          <DialogTrigger asChild>
            <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> New repair</Button>
          </DialogTrigger>
          <RepairDialog
            repair={editing}
            onClose={() => { setOpen(false); setEditing(null); }}
            onSaved={() => { qc.invalidateQueries({ queryKey: ["repairs"] }); setOpen(false); setEditing(null); }}
          />
        </Dialog>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="done">Returned</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {list.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : !filtered.length ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <Wrench className="mx-auto h-6 w-6 text-gold" />
            <p className="mt-3 font-display text-lg text-foreground">No repairs</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const overdue = r.expected_return && !r.actual_return && new Date(r.expected_return) < new Date();
            return (
              <button key={r.id} onClick={() => setEditing(r)} className="w-full text-left">
                <Card className="transition hover:border-gold">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={r.status === "issue" ? "destructive" : "secondary"} className="capitalize">
                          {r.status.replace(/_/g, " ")}
                        </Badge>
                        <span className="font-medium">{r.client?.full_name ?? "—"}</span>
                        {r.client?.display_id && <span className="font-mono text-[10px] text-muted-foreground">{r.client.display_id}</span>}
                        <span className="text-muted-foreground">·</span>
                        <span className="text-sm text-muted-foreground">{r.vendor_ref?.name ?? r.vendor}</span>
                        {r.vendor_ref?.display_id && <span className="font-mono text-[10px] text-muted-foreground">{r.vendor_ref.display_id}</span>}
                        {r.wig?.display_id && <span className="font-mono text-[10px] text-muted-foreground">{r.wig.display_id}</span>}
                        {overdue && <Badge variant="destructive">Overdue</Badge>}
                      </div>
                      {r.work_requested && <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{r.work_requested}</p>}
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <div>Sent {format(new Date(r.date_sent), "MMM d")}</div>
                      {r.expected_return && <div>Due {format(new Date(r.expected_return), "MMM d")}</div>}
                      {r.cost ? <div className="font-medium text-foreground">${Number(r.cost).toLocaleString()}</div> : null}
                    </div>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RepairDialog({ repair, onClose, onSaved }: { repair: Repair | null; onClose: () => void; onSaved: () => void }) {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      client_id: repair?.client_id ?? null,
      vendor_id: repair?.vendor_id ?? null,
      vendor: repair?.vendor ?? "",
      date_sent: repair?.date_sent ?? format(new Date(), "yyyy-MM-dd"),
      expected_return: repair?.expected_return ?? "",
      actual_return: repair?.actual_return ?? "",
      cost: repair?.cost ? Number(repair.cost) : 0,
      work_requested: repair?.work_requested ?? "",
      notes: repair?.notes ?? "",
      status: repair?.status ?? "sent_to_vendor",
    },
  });

  const save = useMutation({
    mutationFn: async (v: z.infer<typeof schema>) => {
      const payload = {
        client_id: v.client_id || null,
        vendor_id: v.vendor_id || null,
        vendor: v.vendor,
        date_sent: v.date_sent,
        expected_return: v.expected_return || null,
        actual_return: v.actual_return || null,
        cost: v.cost ?? 0,
        work_requested: v.work_requested || null,
        notes: v.notes || null,
        status: v.status,
      };
      if (repair) {
        const prevStatus = repair.status;
        const { data, error } = await supabase.from("repairs").update(payload).eq("id", repair.id).select().single();
        if (error) throw error;
        await logAudit({
          action: "update", module: "repair", recordId: repair.id, recordLabel: payload.vendor,
          summary: "Repair updated",
          before: repair as unknown as Record<string, unknown>,
          after: data as unknown as Record<string, unknown>,
        });
        if (v.client_id && prevStatus !== "returned" && payload.status === "returned") {
          await triggerNotificationFn({ data: {
            clientId: v.client_id, templateKey: "wig_ready_for_pickup",
            idempotencyKey: `repair-ready-${repair.id}`,
          }}).catch(() => {});
        }
        if (v.client_id && prevStatus !== "sent_to_vendor" && payload.status === "sent_to_vendor") {
          await triggerNotificationFn({ data: {
            clientId: v.client_id, templateKey: "wig_sent_to_repair",
            vars: { date: formatDateClient(payload.expected_return) },
            idempotencyKey: `repair-sent-${repair.id}`,
          }}).catch(() => {});
        }
      } else {
        const { data, error } = await supabase.from("repairs").insert(payload).select().single();
        if (error) throw error;
        await logAudit({
          action: "create", module: "repair", recordId: data.id, recordLabel: payload.vendor,
          summary: `Repair sent to ${payload.vendor}`,
          after: data as unknown as Record<string, unknown>,
        });
        if (v.client_id && payload.status === "sent_to_vendor") {
          await triggerNotificationFn({ data: {
            clientId: v.client_id, templateKey: "wig_sent_to_repair",
            vars: { date: formatDateClient(payload.expected_return) },
            idempotencyKey: `repair-sent-${data.id}`,
          }}).catch(() => {});
        }
      }
    },
    onSuccess: () => { toast.success("Saved"); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!repair) return;
      const { error } = await supabase.from("repairs").delete().eq("id", repair.id);
      if (error) throw error;
      await logAudit({
        action: "delete", module: "repair", recordId: repair.id, recordLabel: repair.vendor,
        summary: "Repair deleted",
        before: repair as unknown as Record<string, unknown>,
      });
    },
    onSuccess: () => { toast.success("Repair removed"); onSaved(); },
  });

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle className="font-display text-2xl">{repair ? "Edit repair" : "New repair"}</DialogTitle></DialogHeader>
      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
        <div>
          <Label>Client (optional)</Label>
          <ClientSelect value={form.watch("client_id") ?? null} onChange={(id) => form.setValue("client_id", id)} />
        </div>
        <div>
          <Label>Vendor</Label>
          <VendorSelect
            value={form.watch("vendor_id") ?? null}
            onChange={(id) => {
              form.setValue("vendor_id", id, { shouldDirty: true });
            }}
            filterType="repair"
          />
        </div>
        <div>
          <Label>Vendor name (free text fallback)</Label>
          <Input {...form.register("vendor")} placeholder="Required" />
          {form.formState.errors.vendor && <p className="text-xs text-destructive">{form.formState.errors.vendor.message}</p>}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Date sent</Label>
            <Input type="date" {...form.register("date_sent")} />
          </div>
          <div>
            <Label>Expected back</Label>
            <Input type="date" {...form.register("expected_return")} />
          </div>
          <div>
            <Label>Actual back</Label>
            <Input type="date" {...form.register("actual_return")} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Cost ($)</Label>
            <Input type="number" step="0.01" {...form.register("cost")} />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.watch("status")} onValueChange={(v) => form.setValue("status", v as RepairStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Work requested</Label>
          <Textarea rows={2} {...form.register("work_requested")} />
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea rows={2} {...form.register("notes")} />
        </div>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <div>
            {repair && (
              <Button type="button" variant="ghost" onClick={() => remove.mutate()} className="text-destructive gap-2">
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>Save</Button>
          </div>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
