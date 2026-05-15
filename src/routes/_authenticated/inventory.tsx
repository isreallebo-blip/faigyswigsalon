import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Upload, Trash2, Package, ImageOff, Sparkles, X } from "lucide-react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { VendorSelect } from "@/components/vendor-select";

type Wig = Database["public"]["Tables"]["wigs"]["Row"];
type WigStatus = Database["public"]["Enums"]["wig_status"];
type HairType = Database["public"]["Enums"]["hair_type"];
type CustomOrder = Database["public"]["Tables"]["custom_orders"]["Row"];

const STATUS_LABEL: Record<WigStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  sent_for_repair: "At repair",
  sold: "Sold",
};
const STATUS_VARIANT: Record<WigStatus, "default" | "secondary" | "outline"> = {
  available: "secondary",
  reserved: "default",
  sent_for_repair: "outline",
  sold: "outline",
};

const wigSchema = z.object({
  wig_code: z.string().trim().max(40).optional().or(z.literal("")),
  brand: z.string().trim().max(80).optional().or(z.literal("")),
  style: z.string().trim().max(80).optional().or(z.literal("")),
  color: z.string().trim().max(80).optional().or(z.literal("")),
  cap_size: z.string().trim().max(40).optional().or(z.literal("")),
  hair_type: z.union([z.enum(["human", "synthetic"]), z.literal("")]).optional(),
  price: z.coerce.number().min(0),
  cost: z.coerce.number().min(0),
  quantity: z.coerce.number().int().min(0),
  status: z.enum(["available", "reserved", "sent_for_repair", "sold"]),
  reserved_for_client_id: z.string().uuid().nullable().optional(),
  vendor_id: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});
type WigFormValues = z.infer<typeof wigSchema>;

const customOrderSchema = z.object({
  client_id: z.string().uuid().nullable().optional(),
  vendor_id: z.string().uuid().nullable().optional(),
  specs: z.string().trim().max(2000).optional().or(z.literal("")),
  expected_delivery: z.string().optional().or(z.literal("")),
  received_date: z.string().optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});
type CustomOrderFormValues = z.infer<typeof customOrderSchema>;

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({ meta: [{ title: "Inventory — Faigy's Wig Salon" }] }),
  component: InventoryPage,
});

function InventoryPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Atelier</p>
        <h1 className="mt-1 font-display text-4xl">Inventory</h1>
      </div>

      <Tabs defaultValue="catalog">
        <TabsList>
          <TabsTrigger value="catalog">Wig catalog</TabsTrigger>
          <TabsTrigger value="orders">Custom orders</TabsTrigger>
        </TabsList>
        <TabsContent value="catalog" className="pt-4">
          <WigCatalog />
        </TabsContent>
        <TabsContent value="orders" className="pt-4">
          <CustomOrders />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function WigCatalog() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<WigStatus | "all">("all");
  const [openNew, setOpenNew] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const wigs = useQuery({
    queryKey: ["wigs", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wigs")
        .select("*, reserved_for:reserved_for_client_id(full_name), vendor:vendor_id(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as (Wig & { reserved_for: { full_name: string } | null; vendor: { name: string } | null })[];
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (wigs.data ?? []).filter((w) => {
      if (status !== "all" && w.status !== status) return false;
      if (!s) return true;
      return [w.wig_code, w.brand, w.style, w.color, w.cap_size]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(s));
    });
  }, [wigs.data, search, status]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code, brand, style, color"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as WigStatus | "all")}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="available">Available</SelectItem>
            <SelectItem value="reserved">Reserved</SelectItem>
            <SelectItem value="sent_for_repair">At repair</SelectItem>
            <SelectItem value="sold">Sold</SelectItem>
          </SelectContent>
        </Select>
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> New wig
            </Button>
          </DialogTrigger>
          <WigDialog mode="create" onClose={() => setOpenNew(false)} onSaved={(id) => { setOpenNew(false); setSelectedId(id); }} />
        </Dialog>
      </div>

      {wigs.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Package className="mx-auto h-8 w-8 text-gold" />
            <p className="mt-3 font-display text-xl">No wigs to show</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {wigs.data?.length ? "Try a different filter." : "Add your first wig to begin building the catalog."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((w) => (
            <button key={w.id} onClick={() => setSelectedId(w.id)} className="text-left">
              <Card className="overflow-hidden transition hover:shadow-soft hover:border-gold/40">
                <div className="aspect-[3/4] w-full bg-muted">
                  {w.photos?.[0] ? (
                    <img src={w.photos[0]} alt={w.style ?? "Wig"} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-muted-foreground">
                      <ImageOff className="h-8 w-8" />
                    </div>
                  )}
                </div>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {[w.brand, w.style].filter(Boolean).join(" ") || "Untitled"}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground">{w.display_id}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {[w.color, w.cap_size].filter(Boolean).join(" · ") || w.wig_code || "—"}
                      </div>
                    </div>
                    <Badge variant={STATUS_VARIANT[w.status]} className="text-[10px] capitalize">
                      {STATUS_LABEL[w.status]}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="truncate">{w.vendor?.name ? `From ${w.vendor.name}` : `Qty ${w.quantity}`}</span>
                    <span className="tabular-nums">${Number(w.price).toLocaleString()}</span>
                  </div>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}

      <Sheet open={!!selectedId} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          {selectedId && <WigDetail wigId={selectedId} onClose={() => setSelectedId(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function useClientOptions() {
  return useQuery({
    queryKey: ["clients", "options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, full_name, display_id")
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });
}

function WigDialog({
  mode,
  wig,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  wig?: Wig;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const clients = useClientOptions();

  const form = useForm<WigFormValues>({
    resolver: zodResolver(wigSchema),
    defaultValues: {
      wig_code: wig?.wig_code ?? "",
      brand: wig?.brand ?? "",
      style: wig?.style ?? "",
      color: wig?.color ?? "",
      cap_size: wig?.cap_size ?? "",
      hair_type: (wig?.hair_type as HairType | null) ?? "",
      price: Number(wig?.price ?? 0),
      cost: Number(wig?.cost ?? 0),
      quantity: wig?.quantity ?? 1,
      status: wig?.status ?? "available",
      reserved_for_client_id: wig?.reserved_for_client_id ?? null,
      vendor_id: wig?.vendor_id ?? null,
      notes: wig?.notes ?? "",
    },
  });

  const status = form.watch("status");

  const save = useMutation({
    mutationFn: async (values: WigFormValues) => {
      const payload = {
        wig_code: values.wig_code || null,
        brand: values.brand || null,
        style: values.style || null,
        color: values.color || null,
        cap_size: values.cap_size || null,
        hair_type: (values.hair_type || null) as HairType | null,
        price: values.price,
        cost: values.cost,
        quantity: values.quantity,
        status: values.status,
        reserved_for_client_id: values.status === "reserved" ? values.reserved_for_client_id ?? null : null,
        vendor_id: values.vendor_id ?? null,
        notes: values.notes || null,
      };
      const label = [payload.brand, payload.style, payload.wig_code].filter(Boolean).join(" · ") || "Wig";
      if (mode === "edit" && wig) {
        const { data, error } = await supabase.from("wigs").update(payload).eq("id", wig.id).select("*").single();
        if (error) throw error;
        await logAudit({
          action: "update", module: "inventory", recordId: data.id, recordLabel: label, displayId: data.display_id,
          summary: `Wig ${label} updated`,
          before: wig as unknown as Record<string, unknown>,
          after: data as unknown as Record<string, unknown>,
        });
        return data.id;
      }
      const { data, error } = await supabase.from("wigs").insert(payload).select("*").single();
      if (error) throw error;
      await logAudit({
        action: "create", module: "inventory", recordId: data.id, recordLabel: label, displayId: data.display_id,
        summary: `Wig ${label} added to inventory`,
        after: data as unknown as Record<string, unknown>,
      });
      return data.id;
    },
    onSuccess: (id) => {
      toast.success(mode === "edit" ? "Wig updated" : "Wig added");
      qc.invalidateQueries({ queryKey: ["wigs"] });
      onSaved?.(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle className="font-display text-2xl">
          {mode === "edit" ? "Edit wig" : "New wig"}
        </DialogTitle>
      </DialogHeader>
      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Wig ID / Code">
            <Input {...form.register("wig_code")} placeholder="WG-0421" />
          </Field>
          <Field label="Brand">
            <Input {...form.register("brand")} placeholder="Freeda, Yaffa…" />
          </Field>
          <Field label="Style">
            <Input {...form.register("style")} placeholder="Layered, Bob…" />
          </Field>
          <Field label="Color">
            <Input {...form.register("color")} placeholder="Chestnut #6" />
          </Field>
          <Field label="Cap size">
            <Input {...form.register("cap_size")} placeholder="Small / Medium" />
          </Field>
          <Field label="Hair type">
            <Select
              value={form.watch("hair_type") || ""}
              onValueChange={(v) => form.setValue("hair_type", (v || "") as "human" | "synthetic" | "", { shouldDirty: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="human">Human</SelectItem>
                <SelectItem value="synthetic">Synthetic</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Price ($)">
            <Input type="number" step="1" {...form.register("price")} />
          </Field>
          <Field label="Cost ($)">
            <Input type="number" step="1" {...form.register("cost")} />
          </Field>
          <Field label="Quantity">
            <Input type="number" step="1" {...form.register("quantity")} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Status">
            <Select
              value={status}
              onValueChange={(v) => form.setValue("status", v as WigStatus, { shouldDirty: true })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="reserved">Reserved</SelectItem>
                <SelectItem value="sent_for_repair">At repair</SelectItem>
                <SelectItem value="sold">Sold</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {status === "reserved" && (
            <Field label="Reserved for">
              <Select
                value={form.watch("reserved_for_client_id") ?? ""}
                onValueChange={(v) => form.setValue("reserved_for_client_id", v || null, { shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select client…" />
                </SelectTrigger>
                <SelectContent>
                  {clients.data?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </div>

        <Field label="Vendor (supplier)">
          <VendorSelect
            value={form.watch("vendor_id") ?? null}
            onChange={(id) => form.setValue("vendor_id", id, { shouldDirty: true })}
            filterType="supplier"
          />
        </Field>

        <Field label="Notes">
          <Textarea rows={2} {...form.register("notes")} />
        </Field>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : mode === "edit" ? "Save changes" : "Add wig"}
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

function WigDetail({ wigId, onClose }: { wigId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);

  const wig = useQuery({
    queryKey: ["wigs", wigId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wigs")
        .select("*, reserved_for:reserved_for_client_id(full_name)")
        .eq("id", wigId)
        .single();
      if (error) throw error;
      return data as Wig & { reserved_for: { full_name: string } | null };
    },
  });

  const upload = useMutation({
    mutationFn: async (files: FileList) => {
      const w = wig.data!;
      const newUrls: string[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 5 * 1024 * 1024) throw new Error("Max 5MB per image");
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${wigId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("wig-photos").upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        const { data } = supabase.storage.from("wig-photos").getPublicUrl(path);
        newUrls.push(data.publicUrl);
      }
      const photos = [...(w.photos ?? []), ...newUrls];
      const { error } = await supabase.from("wigs").update({ photos }).eq("id", wigId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Photos uploaded");
      qc.invalidateQueries({ queryKey: ["wigs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removePhoto = useMutation({
    mutationFn: async (url: string) => {
      const w = wig.data!;
      const photos = (w.photos ?? []).filter((p) => p !== url);
      const { error } = await supabase.from("wigs").update({ photos }).eq("id", wigId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wigs"] }),
  });

  const del = useMutation({
    mutationFn: async () => {
      const w = wig.data;
      const label = w ? [w.brand, w.style, w.wig_code].filter(Boolean).join(" · ") || "Wig" : "Wig";
      const { error } = await supabase.from("wigs").delete().eq("id", wigId);
      if (error) throw error;
      await logAudit({
        action: "delete", module: "inventory", recordId: wigId, recordLabel: label, displayId: w?.display_id,
        summary: `Wig ${label} deleted`,
        before: w as unknown as Record<string, unknown>,
      });
    },
    onSuccess: () => {
      toast.success("Wig deleted");
      qc.invalidateQueries({ queryKey: ["wigs"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (wig.isLoading || !wig.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  const w = wig.data;

  return (
    <div className="space-y-6">
      <SheetHeader>
        <SheetTitle className="sr-only">{w.brand} {w.style}</SheetTitle>
      </SheetHeader>

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{w.display_id}</p>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground mt-0.5">{w.wig_code || "Wig"}</p>
          <h2 className="font-display text-3xl">{[w.brand, w.style].filter(Boolean).join(" ") || "Untitled"}</h2>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[w.status]}>{STATUS_LABEL[w.status]}</Badge>
            {w.status === "reserved" && w.reserved_for && (
              <span className="text-xs text-muted-foreground">for {w.reserved_for.full_name}</span>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {(w.photos ?? []).map((url) => (
          <div key={url} className="group relative aspect-square overflow-hidden rounded-md bg-muted">
            <img src={url} alt="" className="h-full w-full object-cover" />
            <button
              onClick={() => removePhoto.mutate(url)}
              className="absolute right-1 top-1 rounded-full bg-foreground/70 p-1 text-background opacity-0 transition group-hover:opacity-100"
              aria-label="Remove photo"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          onClick={() => fileInput.current?.click()}
          className="grid aspect-square place-items-center rounded-md border border-dashed border-border bg-muted/40 text-muted-foreground transition hover:border-gold/60 hover:text-foreground"
        >
          <div className="flex flex-col items-center gap-1 text-xs">
            <Upload className="h-4 w-4" />
            Add photo
          </div>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) upload.mutate(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <Card>
        <CardContent className="grid grid-cols-3 gap-3 p-5 text-sm">
          <Stat label="Color" value={w.color} />
          <Stat label="Cap" value={w.cap_size} />
          <Stat label="Hair" value={w.hair_type} />
          <Stat label="Quantity" value={String(w.quantity)} />
          <Stat label="Price" value={`$${Number(w.price).toLocaleString()}`} />
          <Stat label="Cost" value={`$${Number(w.cost).toLocaleString()}`} />
        </CardContent>
      </Card>

      {w.notes && (
        <Card>
          <CardContent className="p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Notes</div>
            <p className="mt-2 whitespace-pre-wrap text-sm">{w.notes}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={() => {
            if (confirm("Delete this wig? This cannot be undone.")) del.mutate();
          }}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete wig
        </Button>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <WigDialog mode="edit" wig={w} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-md bg-muted/50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm capitalize">{value || "—"}</div>
    </div>
  );
}

function CustomOrders() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CustomOrder | null>(null);

  const orders = useQuery({
    queryKey: ["custom_orders", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_orders")
        .select("*, client:client_id(full_name), wig:wig_id(brand, style, wig_code), vendor_ref:vendor_id(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as (CustomOrder & {
        client: { full_name: string } | null;
        wig: { brand: string | null; style: string | null; wig_code: string | null } | null;
        vendor_ref: { name: string } | null;
      })[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("custom_orders").delete().eq("id", id);
      if (error) throw error;
      await logAudit({ action: "delete", module: "custom_order", recordId: id, summary: "Custom order deleted" });
    },
    onSuccess: () => {
      toast.success("Custom order removed");
      qc.invalidateQueries({ queryKey: ["custom_orders"] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog
          open={open || !!editing}
          onOpenChange={(o) => {
            if (!o) {
              setOpen(false);
              setEditing(null);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={() => setOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> New custom order
            </Button>
          </DialogTrigger>
          <CustomOrderDialog
            order={editing}
            onClose={() => {
              setOpen(false);
              setEditing(null);
            }}
          />
        </Dialog>
      </div>

      {orders.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !orders.data?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <Sparkles className="mx-auto h-6 w-6 text-gold" />
            <p className="mt-3 font-display text-lg text-foreground">No custom orders yet</p>
            <p className="mt-1">Track wigs you've commissioned from a vendor for a specific client.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {orders.data.map((o) => {
            const overdue =
              o.expected_delivery && !o.received_date && new Date(o.expected_delivery) < new Date();
            return (
              <Card key={o.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{o.client?.full_name ?? "—"}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-sm text-muted-foreground">{o.vendor_ref?.name || o.vendor || "Unknown vendor"}</span>
                    </div>
                    {o.specs && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{o.specs}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right text-xs">
                      {o.received_date ? (
                        <Badge variant="secondary">
                          Received {format(new Date(o.received_date), "MMM d")}
                        </Badge>
                      ) : o.expected_delivery ? (
                        <Badge variant={overdue ? "destructive" : "outline"}>
                          {overdue ? "Overdue" : "Expected"} {format(new Date(o.expected_delivery), "MMM d")}
                        </Badge>
                      ) : (
                        <Badge variant="outline">No ETA</Badge>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(o)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        if (confirm("Remove this order?")) del.mutate(o.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CustomOrderDialog({
  order,
  onClose,
}: {
  order: CustomOrder | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const clients = useClientOptions();
  const form = useForm<CustomOrderFormValues>({
    resolver: zodResolver(customOrderSchema),
    defaultValues: {
      client_id: order?.client_id ?? null,
      vendor_id: order?.vendor_id ?? null,
      specs: order?.specs ?? "",
      expected_delivery: order?.expected_delivery ?? "",
      received_date: order?.received_date ?? "",
      notes: order?.notes ?? "",
    },
  });

  const save = useMutation({
    mutationFn: async (v: CustomOrderFormValues) => {
      const payload = {
        client_id: v.client_id || null,
        vendor_id: v.vendor_id || null,
        specs: v.specs || null,
        expected_delivery: v.expected_delivery || null,
        received_date: v.received_date || null,
        notes: v.notes || null,
      };
      if (order) {
        const { data, error } = await supabase.from("custom_orders").update(payload).eq("id", order.id).select().single();
        if (error) throw error;
        await logAudit({
          action: "update", module: "custom_order", recordId: order.id, recordLabel: payload.specs ?? "Custom order",
          summary: "Custom order updated",
          before: order as unknown as Record<string, unknown>,
          after: data as unknown as Record<string, unknown>,
        });
      } else {
        const { data, error } = await supabase.from("custom_orders").insert(payload).select().single();
        if (error) throw error;
        await logAudit({
          action: "create", module: "custom_order", recordId: data.id, recordLabel: payload.specs ?? "Custom order",
          summary: "Custom order created",
          after: data as unknown as Record<string, unknown>,
        });
      }
    },
    onSuccess: () => {
      toast.success(order ? "Order updated" : "Order added");
      qc.invalidateQueries({ queryKey: ["custom_orders"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle className="font-display text-2xl">
          {order ? "Edit custom order" : "New custom order"}
        </DialogTitle>
      </DialogHeader>
      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Client">
            <Select
              value={form.watch("client_id") ?? ""}
              onValueChange={(v) => form.setValue("client_id", v || null, { shouldDirty: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select client…" />
              </SelectTrigger>
              <SelectContent>
                {clients.data?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Vendor">
            <VendorSelect
              value={form.watch("vendor_id") ?? null}
              onChange={(id) => form.setValue("vendor_id", id, { shouldDirty: true })}
              filterType="supplier"
            />
          </Field>
          <Field label="Expected delivery">
            <Input type="date" {...form.register("expected_delivery")} />
          </Field>
          <Field label="Received on">
            <Input type="date" {...form.register("received_date")} />
          </Field>
        </div>
        <Field label="Specs">
          <Textarea rows={3} {...form.register("specs")} placeholder="Length, color, density, cap construction…" />
        </Field>
        <Field label="Notes">
          <Textarea rows={2} {...form.register("notes")} />
        </Field>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
