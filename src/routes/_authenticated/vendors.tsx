import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Building2, Phone, Mail, Globe, Trash2, Wrench, Package, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  formatPhone,
  formatPhoneTyping,
  normalizeEmail,
  capitalizeName,
} from "@/lib/client-import";

type Vendor = Database["public"]["Tables"]["vendors"]["Row"];
type VendorType = Database["public"]["Enums"]["vendor_type"];
type VendorStatus = Database["public"]["Enums"]["vendor_status"];

const TYPE_LABEL: Record<VendorType, string> = {
  supplier: "Wig supplier",
  repair: "Repair shop",
  both: "Supplier & repair",
};

const vendorSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  company: z.string().trim().max(120).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.union([z.string().trim().email(), z.literal("")]).optional(),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  website: z.string().trim().max(200).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  type: z.enum(["supplier", "repair", "both"]),
  status: z.enum(["active", "inactive"]),
});
type VendorFormValues = z.infer<typeof vendorSchema>;

export const Route = createFileRoute("/_authenticated/vendors")({
  head: () => ({ meta: [{ title: "Vendors — Faigy's Wig Salon" }] }),
  component: VendorsPage,
});

function VendorsPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<VendorType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<VendorStatus | "all">("all");
  const [openNew, setOpenNew] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const vendors = useQuery({
    queryKey: ["vendors", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const stats = useQuery({
    queryKey: ["vendors", "stats"],
    queryFn: async () => {
      const [wigs, repairs, orders] = await Promise.all([
        supabase.from("wigs").select("vendor_id, cost"),
        supabase.from("repairs").select("vendor_id, cost"),
        supabase.from("custom_orders").select("vendor_id"),
      ]);
      if (wigs.error) throw wigs.error;
      if (repairs.error) throw repairs.error;
      if (orders.error) throw orders.error;
      const map = new Map<string, { orders: number; repairs: number; spent: number }>();
      const ensure = (id: string | null) => {
        if (!id) return null;
        if (!map.has(id)) map.set(id, { orders: 0, repairs: 0, spent: 0 });
        return map.get(id)!;
      };
      for (const w of wigs.data ?? []) {
        const e = ensure(w.vendor_id);
        if (e) {
          e.orders += 1;
          e.spent += Number(w.cost ?? 0);
        }
      }
      for (const r of repairs.data ?? []) {
        const e = ensure(r.vendor_id);
        if (e) {
          e.repairs += 1;
          e.spent += Number(r.cost ?? 0);
        }
      }
      for (const o of orders.data ?? []) {
        const e = ensure(o.vendor_id);
        if (e) e.orders += 1;
      }
      return map;
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (vendors.data ?? []).filter((v) => {
      if (typeFilter !== "all" && v.type !== typeFilter) return false;
      if (statusFilter !== "all" && v.status !== statusFilter) return false;
      if (!s) return true;
      return [v.name, v.company, v.phone, v.email]
        .filter(Boolean)
        .some((x) => x!.toLowerCase().includes(s));
    });
  }, [vendors.data, search, typeFilter, statusFilter]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Network</p>
          <h1 className="mt-1 font-display text-4xl">Vendors</h1>
        </div>
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> New vendor
            </Button>
          </DialogTrigger>
          <VendorDialog
            mode="create"
            onClose={() => setOpenNew(false)}
            onSaved={(id) => {
              setOpenNew(false);
              setSelectedId(id);
            }}
          />
        </Dialog>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, company, phone, email"
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as VendorType | "all")}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="supplier">Wig supplier</SelectItem>
            <SelectItem value="repair">Repair shop</SelectItem>
            <SelectItem value="both">Supplier & repair</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as VendorStatus | "all")}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {vendors.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-gold" />
            <p className="mt-3 font-display text-xl">No vendors yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {vendors.data?.length ? "Try a different search." : "Add your first supplier or repair shop."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => {
            const s = stats.data?.get(v.id);
            return (
              <button key={v.id} onClick={() => setSelectedId(v.id)} className="text-left">
                <Card className="transition hover:shadow-soft hover:border-gold/40">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{v.name}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">{v.display_id}</div>
                        {v.company && (
                          <div className="truncate text-xs text-muted-foreground">{v.company}</div>
                        )}
                      </div>
                      <Badge variant={v.status === "active" ? "secondary" : "outline"} className="text-[10px]">
                        {v.status === "active" ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <Badge variant="outline" className="mt-2 text-[10px]">
                      {TYPE_LABEL[v.type]}
                    </Badge>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-md bg-muted/50 p-2">
                        <div className="text-[10px] uppercase text-muted-foreground">Orders</div>
                        <div className="mt-0.5 font-medium tabular-nums">{s?.orders ?? 0}</div>
                      </div>
                      <div className="rounded-md bg-muted/50 p-2">
                        <div className="text-[10px] uppercase text-muted-foreground">Repairs</div>
                        <div className="mt-0.5 font-medium tabular-nums">{s?.repairs ?? 0}</div>
                      </div>
                      <div className="rounded-md bg-muted/50 p-2">
                        <div className="text-[10px] uppercase text-muted-foreground">Spent</div>
                        <div className="mt-0.5 font-medium tabular-nums">
                          ${Math.round(s?.spent ?? 0).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      )}

      <Sheet open={!!selectedId} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          {selectedId && <VendorDetail vendorId={selectedId} onClose={() => setSelectedId(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function VendorDialog({
  mode,
  vendor,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  vendor?: Vendor;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const form = useForm<VendorFormValues>({
    resolver: zodResolver(vendorSchema),
    defaultValues: {
      name: vendor?.name ?? "",
      company: vendor?.company ?? "",
      phone: vendor?.phone ?? "",
      email: vendor?.email ?? "",
      address: vendor?.address ?? "",
      website: vendor?.website ?? "",
      notes: vendor?.notes ?? "",
      type: vendor?.type ?? "supplier",
      status: vendor?.status ?? "active",
    },
  });

  const save = useMutation({
    mutationFn: async (v: VendorFormValues) => {
      const payload = {
        name: v.name,
        company: v.company || null,
        phone: v.phone || null,
        email: v.email || null,
        address: v.address || null,
        website: v.website || null,
        notes: v.notes || null,
        type: v.type,
        status: v.status,
      };
      if (mode === "edit" && vendor) {
        const { data, error } = await supabase
          .from("vendors")
          .update(payload)
          .eq("id", vendor.id)
          .select("*")
          .single();
        if (error) throw error;
        await logAudit({
          action: "update", module: "vendor", recordId: data.id, recordLabel: data.name, displayId: data.display_id,
          summary: `Vendor ${data.name} updated`,
          before: vendor as unknown as Record<string, unknown>,
          after: data as unknown as Record<string, unknown>,
        });
        return data.id;
      }
      const { data, error } = await supabase
        .from("vendors")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      await logAudit({
        action: "create", module: "vendor", recordId: data.id, recordLabel: data.name, displayId: data.display_id,
        summary: `Vendor ${data.name} created`,
        after: data as unknown as Record<string, unknown>,
      });
      return data.id;
    },
    onSuccess: (id) => {
      toast.success(mode === "edit" ? "Vendor updated" : "Vendor added");
      qc.invalidateQueries({ queryKey: ["vendors"] });
      onSaved?.(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle className="font-display text-2xl">
          {mode === "edit" ? "Edit vendor" : "New vendor"}
        </DialogTitle>
      </DialogHeader>
      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" error={form.formState.errors.name?.message}>
            <Input
              {...form.register("name", {
                onBlur: (e) =>
                  form.setValue("name", capitalizeName(e.target.value), { shouldDirty: true }),
              })}
              placeholder="Vendor or contact name"
            />
          </Field>
          <Field label="Company">
            <Input {...form.register("company")} placeholder="Business name" />
          </Field>
          <Field label="Phone">
            <Input
              value={form.watch("phone") ?? ""}
              onChange={(e) =>
                form.setValue("phone", formatPhoneTyping(e.target.value), { shouldDirty: true })
              }
              onBlur={(e) =>
                form.setValue("phone", formatPhone(e.target.value), { shouldDirty: true })
              }
              placeholder="555-123-4567"
              inputMode="tel"
            />
          </Field>
          <Field label="Email" error={form.formState.errors.email?.message}>
            <Input
              {...form.register("email", {
                onBlur: (e) =>
                  form.setValue("email", normalizeEmail(e.target.value), { shouldDirty: true }),
              })}
              type="email"
              placeholder="vendor@example.com"
            />
          </Field>
          <Field label="Website">
            <Input {...form.register("website")} placeholder="https://" />
          </Field>
          <Field label="Address">
            <Input {...form.register("address")} placeholder="Street, city, ST" />
          </Field>
          <Field label="Type">
            <Select
              value={form.watch("type")}
              onValueChange={(v) => form.setValue("type", v as VendorType, { shouldDirty: true })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="supplier">Wig supplier</SelectItem>
                <SelectItem value="repair">Repair shop</SelectItem>
                <SelectItem value="both">Supplier & repair</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Status">
            <Select
              value={form.watch("status")}
              onValueChange={(v) => form.setValue("status", v as VendorStatus, { shouldDirty: true })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Notes">
          <Textarea rows={3} {...form.register("notes")} />
        </Field>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : mode === "edit" ? "Save changes" : "Add vendor"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function VendorDetail({ vendorId, onClose }: { vendorId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const vendor = useQuery({
    queryKey: ["vendors", vendorId],
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("*").eq("id", vendorId).single();
      if (error) throw error;
      return data;
    },
  });

  const wigs = useQuery({
    queryKey: ["vendors", vendorId, "wigs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wigs")
        .select("id, wig_code, brand, style, color, status, price, cost, created_at")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const repairs = useQuery({
    queryKey: ["vendors", vendorId, "repairs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("repairs")
        .select("id, work_requested, cost, status, date_sent, expected_return, actual_return, client:client_id(full_name), wig:wig_id(brand, style, wig_code)")
        .eq("vendor_id", vendorId)
        .order("date_sent", { ascending: false });
      if (error) throw error;
      return data as Array<{
        id: string;
        work_requested: string | null;
        cost: number | null;
        status: string;
        date_sent: string;
        expected_return: string | null;
        actual_return: string | null;
        client: { full_name: string } | null;
        wig: { brand: string | null; style: string | null; wig_code: string | null } | null;
      }>;
    },
  });

  const orders = useQuery({
    queryKey: ["vendors", vendorId, "custom_orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_orders")
        .select("id, specs, expected_delivery, received_date, created_at, client:client_id(full_name)")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Array<{
        id: string;
        specs: string | null;
        expected_delivery: string | null;
        received_date: string | null;
        created_at: string;
        client: { full_name: string } | null;
      }>;
    },
  });

  const del = useMutation({
    mutationFn: async () => {
      const label = vendor.data?.name ?? "Vendor";
      const { error } = await supabase.from("vendors").delete().eq("id", vendorId);
      if (error) throw error;
      await logAudit({
        action: "delete", module: "vendor", recordId: vendorId, recordLabel: label, displayId: vendor.data?.display_id,
        summary: `Vendor ${label} deleted`,
        before: vendor.data as unknown as Record<string, unknown>,
      });
    },
    onSuccess: () => {
      toast.success("Vendor deleted");
      qc.invalidateQueries({ queryKey: ["vendors"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (vendor.isLoading || !vendor.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const v = vendor.data;
  const inventorySpend = (wigs.data ?? []).reduce((s, w) => s + Number(w.cost ?? 0), 0);
  const repairSpend = (repairs.data ?? []).reduce((s, r) => s + Number(r.cost ?? 0), 0);
  const orderCount = orders.data?.length ?? 0;

  return (
    <div className="space-y-6">
      <SheetHeader>
        <SheetTitle className="sr-only">{v.name}</SheetTitle>
      </SheetHeader>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{TYPE_LABEL[v.type]}</p>
          <h2 className="mt-0.5 font-display text-3xl">{v.name}</h2>
          <p className="font-mono text-xs text-muted-foreground mt-0.5">{v.display_id}</p>
          {v.company && <p className="text-sm text-muted-foreground">{v.company}</p>}
          <Badge variant={v.status === "active" ? "secondary" : "outline"} className="mt-2">
            {v.status === "active" ? "Active" : "Inactive"}
          </Badge>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          Edit
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-5 text-sm sm:grid-cols-2">
          {v.phone && (
            <ContactRow icon={<Phone className="h-3.5 w-3.5" />} label={v.phone} href={`tel:${v.phone}`} />
          )}
          {v.email && (
            <ContactRow icon={<Mail className="h-3.5 w-3.5" />} label={v.email} href={`mailto:${v.email}`} />
          )}
          {v.website && (
            <ContactRow
              icon={<Globe className="h-3.5 w-3.5" />}
              label={v.website}
              href={v.website.startsWith("http") ? v.website : `https://${v.website}`}
            />
          )}
          {v.address && (
            <ContactRow icon={<Building2 className="h-3.5 w-3.5" />} label={v.address} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Spending summary</div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
            <SummaryStat label="Inventory" value={inventorySpend} />
            <SummaryStat label="Repairs" value={repairSpend} />
            <SummaryStat label="Custom orders" value={orderCount} format="count" />
            <SummaryStat label="Total spend" value={inventorySpend + repairSpend} highlight />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="inventory">
        <TabsList>
          <TabsTrigger value="inventory" className="gap-2">
            <Package className="h-3.5 w-3.5" /> Inventory ({wigs.data?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="repairs" className="gap-2">
            <Wrench className="h-3.5 w-3.5" /> Repairs ({repairs.data?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="orders" className="gap-2">
            <Sparkles className="h-3.5 w-3.5" /> Custom orders ({orderCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="pt-3">
          {!wigs.data?.length ? (
            <EmptyTab text="No wigs sourced from this vendor yet." />
          ) : (
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/60">
                  <tr className="text-left">
                    <th className="p-2">Code</th>
                    <th className="p-2">Style</th>
                    <th className="p-2">Color</th>
                    <th className="p-2">Status</th>
                    <th className="p-2 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {wigs.data.map((w) => (
                    <tr key={w.id} className="border-t">
                      <td className="p-2">{w.wig_code || "—"}</td>
                      <td className="p-2">{[w.brand, w.style].filter(Boolean).join(" ") || "—"}</td>
                      <td className="p-2">{w.color || "—"}</td>
                      <td className="p-2 capitalize">{w.status.replace("_", " ")}</td>
                      <td className="p-2 text-right tabular-nums">${Number(w.cost ?? 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="repairs" className="pt-3">
          {!repairs.data?.length ? (
            <EmptyTab text="No repairs sent to this vendor yet." />
          ) : (
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/60">
                  <tr className="text-left">
                    <th className="p-2">Client</th>
                    <th className="p-2">Wig</th>
                    <th className="p-2">Sent</th>
                    <th className="p-2">Work</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Returned</th>
                    <th className="p-2 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {repairs.data.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-2">{r.client?.full_name ?? "—"}</td>
                      <td className="p-2">
                        {[r.wig?.brand, r.wig?.style].filter(Boolean).join(" ") || r.wig?.wig_code || "—"}
                      </td>
                      <td className="p-2">{format(new Date(r.date_sent), "MMM d, yyyy")}</td>
                      <td className="p-2 max-w-[180px] truncate">{r.work_requested || "—"}</td>
                      <td className="p-2 capitalize">{r.status.replace(/_/g, " ")}</td>
                      <td className="p-2">
                        {r.actual_return
                          ? format(new Date(r.actual_return), "MMM d")
                          : r.expected_return
                            ? `Exp ${format(new Date(r.expected_return), "MMM d")}`
                            : "—"}
                      </td>
                      <td className="p-2 text-right tabular-nums">${Number(r.cost ?? 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="orders" className="pt-3">
          {!orders.data?.length ? (
            <EmptyTab text="No custom orders placed with this vendor yet." />
          ) : (
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/60">
                  <tr className="text-left">
                    <th className="p-2">Client</th>
                    <th className="p-2">Specs</th>
                    <th className="p-2">Ordered</th>
                    <th className="p-2">Expected</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.data.map((o) => (
                    <tr key={o.id} className="border-t">
                      <td className="p-2">{o.client?.full_name ?? "—"}</td>
                      <td className="p-2 max-w-[220px] truncate">{o.specs || "—"}</td>
                      <td className="p-2">{format(new Date(o.created_at), "MMM d, yyyy")}</td>
                      <td className="p-2">
                        {o.expected_delivery ? format(new Date(o.expected_delivery), "MMM d") : "—"}
                      </td>
                      <td className="p-2">
                        {o.received_date ? (
                          <Badge variant="secondary" className="text-[10px]">
                            Received
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            Pending
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {v.notes && (
        <Card>
          <CardContent className="p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Notes</div>
            <p className="mt-2 whitespace-pre-wrap text-sm">{v.notes}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={() => {
            if (confirm("Delete this vendor? Linked records will be unlinked.")) del.mutate();
          }}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete vendor
        </Button>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <VendorDialog
          mode="edit"
          vendor={v}
          onClose={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      </Dialog>
    </div>
  );
}

function ContactRow({ icon, label, href }: { icon: React.ReactNode; label: string; href?: string }) {
  const inner = (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  );
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="hover:underline">
      {inner}
    </a>
  ) : (
    inner
  );
}

function SummaryStat({
  label,
  value,
  highlight,
  format: fmt = "money",
}: {
  label: string;
  value: number;
  highlight?: boolean;
  format?: "money" | "count";
}) {
  return (
    <div className={`rounded-md p-3 ${highlight ? "bg-gold/15" : "bg-muted/50"}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-xl tabular-nums">
        {fmt === "money" ? `$${Math.round(value).toLocaleString()}` : value}
      </div>
    </div>
  );
}

function EmptyTab({ text }: { text: string }) {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">{text}</CardContent>
    </Card>
  );
}
