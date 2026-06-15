import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Phone, Mail, Upload, Trash2, Calendar, Wrench, Wallet, Sparkles, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { useAccess } from "@/lib/use-access";
import { ClientImportDialog } from "@/components/client-import-dialog";
import { capitalizeName, formatPhone, formatPhoneTyping, normalizeEmail } from "@/lib/client-import";
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
import { useServerFn } from "@tanstack/react-start";
import { getClientUnreadCount } from "@/lib/inbox.functions";
import { ClientMessages } from "@/components/client-messages";
import { PortalAccessTab, PortalAccessCard, PortalStatusDot } from "@/components/portal-access";
import { useSignedPhoto } from "@/lib/use-signed-photo";
import { PaymentMethodsTab } from "@/components/payment-methods-tab";
import { ChargeCardDialog } from "@/components/charge-card-dialog";

type Client = Database["public"]["Tables"]["clients"]["Row"];
type ClientStatus = Database["public"]["Enums"]["client_status"];

const STATUS_LABEL: Record<ClientStatus, string> = {
  new_consultation: "New consultation",
  active: "Active",
  inactive: "Inactive",
};
const STATUS_VARIANT: Record<ClientStatus, "default" | "secondary" | "outline"> = {
  new_consultation: "default",
  active: "secondary",
  inactive: "outline",
};

const measurementsSchema = z.object({
  circumference: z.coerce.number().positive().optional().or(z.literal("")),
  front_to_nape: z.coerce.number().positive().optional().or(z.literal("")),
  ear_to_ear: z.coerce.number().positive().optional().or(z.literal("")),
});

const clientSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required").max(120),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.union([z.string().trim().email(), z.literal("")]).optional(),
  status: z.enum(["new_consultation", "active", "inactive"]),
  preferences: z.string().trim().max(2000).optional().or(z.literal("")),
  notes: z.string().trim().max(4000).optional().or(z.literal("")),
  measurements: measurementsSchema,
});

type ClientFormValues = z.infer<typeof clientSchema>;

export const Route = createFileRoute("/_authenticated/clients")({
  head: () => ({ meta: [{ title: "Clients — Faigy's Wig Salon" }] }),
  component: ClientsPage,
});

function ClientsPage() {
  const { isAdmin } = useAccess();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ClientStatus | "all">("all");
  const [openNew, setOpenNew] = useState(false);
  const [openImport, setOpenImport] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const clients = useQuery({
    queryKey: ["clients", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (clients.data ?? []).filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (!s) return true;
      return (
        c.full_name.toLowerCase().includes(s) ||
        (c.phone ?? "").toLowerCase().includes(s) ||
        (c.email ?? "").toLowerCase().includes(s)
      );
    });
  }, [clients.data, search, status]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Roster</p>
          <h1 className="mt-1 font-display text-4xl">Clients</h1>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button variant="outline" className="gap-2" onClick={() => setOpenImport(true)}>
              <FileSpreadsheet className="h-4 w-4" /> Import clients
            </Button>
          )}
          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" /> New client
              </Button>
            </DialogTrigger>
            <ClientDialog
              mode="create"
              onClose={() => setOpenNew(false)}
              onSaved={(id) => {
                setOpenNew(false);
                setSelectedId(id);
              }}
            />
          </Dialog>
        </div>
      </div>

      {isAdmin && <ClientImportDialog open={openImport} onOpenChange={setOpenImport} />}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, or email"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as ClientStatus | "all")}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="new_consultation">New consultation</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {clients.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-gold" />
            <p className="mt-3 font-display text-xl">No clients yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {clients.data?.length ? "Try a different search." : "Add your first client to get started."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className="text-left"
            >
              <Card className="transition hover:shadow-soft hover:border-gold/40">
                <CardContent className="flex items-center gap-4 p-4">
                  <ClientAvatar client={c} size={48} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 truncate font-medium">
                      <PortalStatusDot status={(c.portal_status ?? "not_signed_up") as "not_signed_up" | "active" | "locked" | "disabled" | "pending_verification"} />
                      <span className="truncate">{c.full_name}</span>
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">{c.display_id}</div>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                      {c.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {c.phone}
                        </span>
                      )}
                      {c.email && (
                        <span className="inline-flex items-center gap-1 truncate">
                          <Mail className="h-3 w-3" />
                          <span className="truncate">{c.email}</span>
                        </span>
                      )}
                    </div>
                    <Badge variant={STATUS_VARIANT[c.status]} className="mt-2 text-[10px]">
                      {STATUS_LABEL[c.status]}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}

      <Sheet open={!!selectedId} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          {selectedId && <ClientDetail clientId={selectedId} onClose={() => setSelectedId(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ClientAvatar({ client, size = 40 }: { client: Pick<Client, "full_name" | "photo_url">; size?: number }) {
  const initials = client.full_name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const signed = useSignedPhoto("client-photos", client.photo_url);
  if (signed) {
    return (
      <img
        src={signed}
        alt={client.full_name}
        style={{ width: size, height: size }}
        className="rounded-full object-cover"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="grid place-items-center rounded-full bg-accent font-display text-accent-foreground"
    >
      {initials || "·"}
    </div>
  );
}


function ClientDialog({
  mode,
  client,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  client?: Client;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const m = (client?.measurements ?? {}) as Record<string, number | undefined>;
  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      full_name: client?.full_name ?? "",
      phone: client?.phone ?? "",
      email: client?.email ?? "",
      status: client?.status ?? "new_consultation",
      preferences: client?.preferences ?? "",
      notes: client?.notes ?? "",
      measurements: {
        circumference: (m.circumference as number | undefined) ?? "",
        front_to_nape: (m.front_to_nape as number | undefined) ?? "",
        ear_to_ear: (m.ear_to_ear as number | undefined) ?? "",
      } as ClientFormValues["measurements"],
    },
  });

  const save = useMutation({
    mutationFn: async (values: ClientFormValues) => {
      const measurements = Object.fromEntries(
        Object.entries(values.measurements).filter(([, v]) => v !== "" && v !== undefined),
      );
      const payload = {
        full_name: values.full_name,
        phone: values.phone || null,
        email: values.email || null,
        status: values.status,
        preferences: values.preferences || null,
        notes: values.notes || null,
        measurements,
      };
      if (mode === "edit" && client) {
        const { data, error } = await supabase
          .from("clients")
          .update(payload)
          .eq("id", client.id)
          .select("*")
          .single();
        if (error) throw error;
        await logAudit({
          action: "update", module: "client", recordId: data.id, recordLabel: data.full_name, displayId: data.display_id,
          summary: `Client ${data.full_name} updated`,
          before: client as unknown as Record<string, unknown>,
          after: data as unknown as Record<string, unknown>,
        });
        return data.id;
      }
      const { data, error } = await supabase
        .from("clients")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      await logAudit({
        action: "create", module: "client", recordId: data.id, recordLabel: data.full_name, displayId: data.display_id,
        summary: `Client ${data.full_name} created`,
        after: data as unknown as Record<string, unknown>,
      });
      return data.id;
    },
    onSuccess: (id) => {
      toast.success(mode === "edit" ? "Client updated" : "Client added");
      qc.invalidateQueries({ queryKey: ["clients"] });
      onSaved?.(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle className="font-display text-2xl">
          {mode === "edit" ? "Edit client" : "New client"}
        </DialogTitle>
      </DialogHeader>
      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" error={form.formState.errors.full_name?.message}>
            <Input
              {...form.register("full_name", {
                onBlur: (e) => form.setValue("full_name", capitalizeName(e.target.value), { shouldDirty: true }),
              })}
              placeholder="Sarah Goldberg"
            />
          </Field>
          <Field label="Status">
            <Select
              value={form.watch("status")}
              onValueChange={(v) => form.setValue("status", v as ClientStatus, { shouldDirty: true })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new_consultation">New consultation</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Phone">
            <Input
              value={form.watch("phone") ?? ""}
              onChange={(e) => form.setValue("phone", formatPhoneTyping(e.target.value), { shouldDirty: true })}
              onBlur={(e) => form.setValue("phone", formatPhone(e.target.value), { shouldDirty: true })}
              placeholder="555-123-4567"
              inputMode="tel"
            />
          </Field>
          <Field label="Email" error={form.formState.errors.email?.message}>
            <Input
              {...form.register("email", {
                onBlur: (e) => form.setValue("email", normalizeEmail(e.target.value), { shouldDirty: true }),
              })}
              type="email"
              placeholder="sarah@example.com"
            />
          </Field>
        </div>

        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Measurements (in)
          </Label>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <Field label="Circumference">
              <Input type="number" step="0.25" {...form.register("measurements.circumference")} />
            </Field>
            <Field label="Front to nape">
              <Input type="number" step="0.25" {...form.register("measurements.front_to_nape")} />
            </Field>
            <Field label="Ear to ear">
              <Input type="number" step="0.25" {...form.register("measurements.ear_to_ear")} />
            </Field>
          </div>
        </div>

        <Field label="Preferences">
          <Textarea rows={2} {...form.register("preferences")} placeholder="Lengths, colors, styles…" />
        </Field>

        <Field label="Notes">
          <Textarea rows={3} {...form.register("notes")} placeholder="Anything to remember about this client" />
        </Field>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : mode === "edit" ? "Save changes" : "Add client"}
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

function ClientDetail({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const client = useQuery({
    queryKey: ["clients", clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").eq("id", clientId).single();
      if (error) throw error;
      return data;
    },
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 5 * 1024 * 1024) throw new Error("Max 5MB");
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${clientId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("client-photos").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { error } = await supabase.from("clients").update({ photo_url: path }).eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Photo updated");
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removePhoto = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("clients").update({ photo_url: null }).eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });

  const del = useMutation({
    mutationFn: async () => {
      const label = client.data?.full_name ?? "Client";
      const { error } = await supabase.from("clients").delete().eq("id", clientId);
      if (error) throw error;
      await logAudit({
        action: "delete", module: "client", recordId: clientId, recordLabel: label, displayId: client.data?.display_id,
        summary: `Client ${label} deleted`,
        before: client.data as unknown as Record<string, unknown>,
      });
    },
    onSuccess: () => {
      toast.success("Client deleted");
      qc.invalidateQueries({ queryKey: ["clients"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (client.isLoading || !client.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  const c = client.data;
  const m = (c.measurements ?? {}) as Record<string, number | undefined>;

  return (
    <div className="space-y-6">
      <SheetHeader>
        <SheetTitle className="sr-only">{c.full_name}</SheetTitle>
      </SheetHeader>

      <div className="flex items-start gap-4">
        <div className="relative">
          <ClientAvatar client={c} size={84} />
          <button
            onClick={() => fileInput.current?.click()}
            className="absolute -bottom-1 -right-1 rounded-full bg-foreground p-1.5 text-background shadow-soft hover:opacity-90"
            aria-label="Upload photo"
          >
            <Upload className="h-3 w-3" />
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload.mutate(f);
              e.target.value = "";
            }}
          />
        </div>
        <div className="flex-1">
          <h2 className="font-display text-3xl leading-tight">{c.full_name}</h2>
          <p className="font-mono text-xs text-muted-foreground mt-0.5">{c.display_id}</p>
          <Badge variant={STATUS_VARIANT[c.status]} className="mt-2">
            {STATUS_LABEL[c.status]}
          </Badge>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {c.phone && (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                {c.phone}
              </span>
            )}
            {c.email && (
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                {c.email}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ChargeCardDialog clientId={clientId} clientName={c.full_name} />
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
      </div>

      <ClientProfileTabs clientId={clientId} client={c}>
        <TabsContent value="profile" className="space-y-4 pt-4">
          <PortalAccessCard clientId={clientId} />
          <Card>
            <CardContent className="p-5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Measurements</div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                <Stat label="Circumference" value={m.circumference} />
                <Stat label="Front to nape" value={m.front_to_nape} />
                <Stat label="Ear to ear" value={m.ear_to_ear} />
              </div>
            </CardContent>
          </Card>
          {c.preferences && (
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Preferences</div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{c.preferences}</p>
              </CardContent>
            </Card>
          )}
          {c.notes && (
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Notes</div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{c.notes}</p>
              </CardContent>
            </Card>
          )}
          <div className="flex items-center justify-between pt-2">
            {c.photo_url && (
              <Button variant="ghost" size="sm" onClick={() => removePhoto.mutate()}>
                Remove photo
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-destructive"
              onClick={() => {
                if (confirm(`Delete ${c.full_name}? This cannot be undone.`)) del.mutate();
              }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete client
            </Button>
          </div>
        </TabsContent>
        <TabsContent value="timeline" className="pt-4">
          <ClientTimeline clientId={clientId} />
        </TabsContent>
        <TabsContent value="messages" className="pt-4">
          <ClientMessages
            clientId={clientId}
            clientHasPhone={!!c.phone}
            clientHasEmail={!!c.email}
          />
        </TabsContent>
        <TabsContent value="cards" className="pt-4">
          <PaymentMethodsTab clientId={clientId} />
        </TabsContent>
        <TabsContent value="portal" className="pt-4">
          <PortalAccessTab clientId={clientId} />
        </TabsContent>
      </ClientProfileTabs>

      <Dialog open={editing} onOpenChange={setEditing}>
        <ClientDialog
          mode="edit"
          client={c}
          onClose={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      </Dialog>
    </div>
  );
}

function ClientProfileTabs({
  clientId,
  client,
  children,
}: {
  clientId: string;
  client: Client;
  children: React.ReactNode;
}) {
  const unreadFn = useServerFn(getClientUnreadCount);
  const { data: unread } = useQuery({
    queryKey: ["client-unread", clientId],
    queryFn: () => unreadFn({ data: { clientId } }),
    refetchInterval: 30000,
  });
  void client;
  const count = unread?.count ?? 0;
  return (
    <Tabs defaultValue="profile">
      <TabsList>
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="timeline">Timeline</TabsTrigger>
        <TabsTrigger value="messages" className="relative">
          Messages
          {count > 0 && (
            <Badge className="ml-2 h-4 px-1.5 text-[10px] bg-destructive text-destructive-foreground">
              {count}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="cards">Payment Methods</TabsTrigger>
        <TabsTrigger value="portal">Portal Access</TabsTrigger>
      </TabsList>
      {children}
    </Tabs>
  );
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-md bg-muted/50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-lg tabular-nums">{value ? `${value}"` : "—"}</div>
    </div>
  );
}

type TimelineItem = {
  id: string;
  at: string;
  icon: React.ReactNode;
  title: string;
  detail?: string;
};

function ClientTimeline({ clientId }: { clientId: string }) {
  const items = useQuery({
    queryKey: ["clients", clientId, "timeline"],
    queryFn: async (): Promise<TimelineItem[]> => {
      const [appts, payments, repairs, activity] = await Promise.all([
        supabase
          .from("appointments")
          .select("id, type, status, starts_at, notes")
          .eq("client_id", clientId)
          .order("starts_at", { ascending: false }),
        supabase
          .from("payments")
          .select("id, amount, method, category, description, date")
          .eq("client_id", clientId)
          .order("date", { ascending: false }),
        supabase
          .from("repairs")
          .select("id, vendor, work_requested, date_sent, status")
          .eq("client_id", clientId)
          .order("date_sent", { ascending: false }),
        supabase
          .from("activity_log")
          .select("id, type, summary, created_at")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false }),
      ]);

      const out: TimelineItem[] = [];
      appts.data?.forEach((a) =>
        out.push({
          id: `a-${a.id}`,
          at: a.starts_at,
          icon: <Calendar className="h-3.5 w-3.5" />,
          title: `${a.type.replace("_", " ")} · ${a.status}`,
          detail: a.notes ?? undefined,
        }),
      );
      payments.data?.forEach((p) =>
        out.push({
          id: `p-${p.id}`,
          at: p.date,
          icon: <Wallet className="h-3.5 w-3.5" />,
          title: `$${Number(p.amount).toLocaleString()} · ${p.category.replace("_", " ")}`,
          detail: p.description ?? p.method,
        }),
      );
      repairs.data?.forEach((r) =>
        out.push({
          id: `r-${r.id}`,
          at: r.date_sent,
          icon: <Wrench className="h-3.5 w-3.5" />,
          title: `Repair at ${r.vendor} · ${r.status.replace("_", " ")}`,
          detail: r.work_requested ?? undefined,
        }),
      );
      activity.data?.forEach((e) =>
        out.push({
          id: `e-${e.id}`,
          at: e.created_at,
          icon: <Sparkles className="h-3.5 w-3.5" />,
          title: e.summary,
        }),
      );
      out.sort((a, b) => +new Date(b.at) - +new Date(a.at));
      return out;
    },
  });

  if (items.isLoading) return <Skeleton className="h-32 w-full" />;
  if (!items.data?.length) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No activity recorded yet.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="relative space-y-4 pl-6 before:absolute before:left-2 before:top-1.5 before:h-full before:w-px before:bg-border">
      {items.data.map((it) => (
        <div key={it.id} className="relative">
          <div className="absolute -left-[18px] grid h-5 w-5 place-items-center rounded-full bg-background ring-1 ring-border text-muted-foreground">
            {it.icon}
          </div>
          <div className="text-xs text-muted-foreground">{format(new Date(it.at), "MMM d, yyyy")}</div>
          <div className="mt-0.5 text-sm font-medium capitalize">{it.title}</div>
          {it.detail && <div className="mt-0.5 text-xs text-muted-foreground">{it.detail}</div>}
        </div>
      ))}
    </div>
  );
}
