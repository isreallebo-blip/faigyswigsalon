import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  format, addDays, startOfWeek, endOfWeek, startOfDay, endOfDay,
  isSameDay, parseISO, addWeeks, subWeeks,
  startOfMonth, endOfMonth, addMonths, subMonths,
  startOfYear, endOfYear, addYears, subYears, isSameMonth,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Trash2, CalendarDays } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { triggerNotificationFn, appointmentVarsClient } from "@/lib/notifications/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClientSelect } from "@/components/client-select";
import { hebrewDateString, getHolidaysInRange, holidaysForDay, isShabbatColumn } from "@/lib/hebrew-calendar";
import { useHebrewSettings } from "@/lib/use-hebrew-settings";
import { cn } from "@/lib/utils";

type Appt = Database["public"]["Tables"]["appointments"]["Row"];
type ApptType = Database["public"]["Enums"]["appointment_type"];
type ApptStatus = Database["public"]["Enums"]["appointment_status"];

const TYPES: ApptType[] = ["consultation", "cut", "wash_set", "pickup"];
const STATUSES: ApptStatus[] = ["scheduled", "confirmed", "completed", "no_show", "cancelled"];

const schema = z.object({
  client_id: z.string().uuid("Pick a client"),
  type: z.enum(["consultation", "cut", "wash_set", "pickup"]),
  starts_at: z.string().min(1, "Pick a date & time"),
  duration_min: z.number().int().min(15).max(480),
  notes: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/appointments")({
  head: () => ({ meta: [{ title: "Appointments — Faigy's Wig Salon" }] }),
  component: AppointmentsPage,
});

function AppointmentsPage() {
  const [view, setView] = useState<"day" | "week" | "month" | "year">("week");
  const [cursor, setCursor] = useState(new Date());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Appt | null>(null);
  const qc = useQueryClient();
  const { showDates, showHolidays } = useHebrewSettings();

  const range = useMemo(() => {
    if (view === "day") return { from: startOfDay(cursor), to: endOfDay(cursor) };
    if (view === "week") return { from: startOfWeek(cursor), to: endOfWeek(cursor) };
    if (view === "month") {
      return { from: startOfWeek(startOfMonth(cursor)), to: endOfWeek(endOfMonth(cursor)) };
    }
    return { from: startOfYear(cursor), to: endOfYear(cursor) };
  }, [view, cursor]);

  const appts = useQuery({
    queryKey: ["appointments", range.from.toISOString(), range.to.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, client:client_id(full_name, display_id)")
        .gte("starts_at", range.from.toISOString())
        .lte("starts_at", range.to.toISOString())
        .order("starts_at");
      if (error) throw error;
      return data as (Appt & { client: { full_name: string; display_id: string } | null })[];
    },
  });

  const days = useMemo(() => {
    if (view === "day") return [cursor];
    if (view === "week") {
      const start = startOfWeek(cursor);
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    if (view === "month") {
      const start = startOfWeek(startOfMonth(cursor));
      const end = endOfWeek(endOfMonth(cursor));
      const count = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
      return Array.from({ length: count }, (_, i) => addDays(start, i));
    }
    return [];
  }, [view, cursor]);

  const months = useMemo(() => {
    if (view !== "year") return [];
    const start = startOfYear(cursor);
    return Array.from({ length: 12 }, (_, i) => addMonths(start, i));
  }, [view, cursor]);

  const holidays = useMemo(
    () => (showHolidays && days.length > 0 ? getHolidaysInRange(days[0], days[days.length - 1]) : []),
    [days, showHolidays],
  );

  const goPrev = () => {
    if (view === "day") setCursor(addDays(cursor, -1));
    else if (view === "week") setCursor(subWeeks(cursor, 1));
    else if (view === "month") setCursor(subMonths(cursor, 1));
    else setCursor(subYears(cursor, 1));
  };
  const goNext = () => {
    if (view === "day") setCursor(addDays(cursor, 1));
    else if (view === "week") setCursor(addWeeks(cursor, 1));
    else if (view === "month") setCursor(addMonths(cursor, 1));
    else setCursor(addYears(cursor, 1));
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Schedule</p>
          <h1 className="mt-1 font-display text-4xl">Appointments</h1>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
            <TabsList>
              <TabsTrigger value="day">Day</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="icon" onClick={() => setCursor(view === "day" ? addDays(cursor, -1) : subWeeks(cursor, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>Today</Button>
          <Button variant="outline" size="icon" onClick={() => setCursor(view === "day" ? addDays(cursor, 1) : addWeeks(cursor, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Dialog open={open || !!editing} onOpenChange={(o) => { if (!o) { setOpen(false); setEditing(null); } }}>
            <DialogTrigger asChild>
              <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> New</Button>
            </DialogTrigger>
            <ApptDialog
              appt={editing}
              defaultDate={cursor}
              onClose={() => { setOpen(false); setEditing(null); }}
              onSaved={() => { qc.invalidateQueries({ queryKey: ["appointments"] }); setOpen(false); setEditing(null); }}
            />
          </Dialog>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {view === "day"
          ? format(cursor, "EEEE, MMMM d, yyyy")
          : `${format(range.from, "MMM d")} – ${format(range.to, "MMM d, yyyy")}`}
      </p>

      {appts.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className={view === "day" ? "space-y-3" : "grid gap-3 md:grid-cols-2 lg:grid-cols-7"}>
          {days.map((day) => {
            const dayAppts = (appts.data ?? []).filter((a) => isSameDay(parseISO(a.starts_at), day));
            const dayHolidays = holidaysForDay(day, holidays);
            const isShabbat = isShabbatColumn(day);
            return (
              <Card
                key={day.toISOString()}
                className={cn(
                  view === "week" ? "min-h-[200px]" : "",
                  isShabbat && "bg-gold-soft/10",
                )}
              >
                <CardContent className="p-4">
                  <div className="mb-3 flex items-baseline justify-between border-b border-border pb-2">
                    <div className="flex flex-col">
                      <span className="font-display text-lg">{format(day, "EEE")}</span>
                      {showDates && (
                        <span dir="rtl" className="text-[10px] text-muted-foreground">
                          {hebrewDateString(day)}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{format(day, "MMM d")}</span>
                  </div>
                  {dayHolidays.length > 0 && (
                    <div className="mb-2 space-y-1">
                      {dayHolidays.map((h) => (
                        <div
                          key={h.title}
                          dir="rtl"
                          className="rounded-md bg-gold/15 px-2 py-1 text-right text-[11px] font-medium text-gold"
                        >
                          {h.title}
                        </div>
                      ))}
                    </div>
                  )}
                  {dayAppts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No appointments</p>
                  ) : (
                    <div className="space-y-2">
                      {dayAppts.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => setEditing(a)}
                          className="w-full rounded-md border border-border bg-card p-2 text-left text-xs transition hover:border-gold"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium tabular-nums">{format(parseISO(a.starts_at), "h:mm a")}</span>
                            <Badge variant="secondary" className="text-[10px] capitalize">{a.status}</Badge>
                          </div>
                          <p className="mt-1 truncate font-medium">{a.client?.full_name ?? "—"}</p>
                          {a.client?.display_id && <p className="font-mono text-[10px] text-muted-foreground">{a.client.display_id}</p>}
                          <p className="text-muted-foreground capitalize">{a.type.replace("_", " ")}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!appts.isLoading && (appts.data?.length ?? 0) === 0 && view === "day" && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <CalendarDays className="mx-auto h-6 w-6 text-gold" />
            <p className="mt-3 font-display text-lg text-foreground">Nothing scheduled</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ApptDialog({
  appt, defaultDate, onClose, onSaved,
}: {
  appt: Appt | null;
  defaultDate: Date;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialStart = appt ? parseISO(appt.starts_at) : defaultDate;
  const initialDuration = appt && appt.ends_at
    ? Math.round((parseISO(appt.ends_at).getTime() - parseISO(appt.starts_at).getTime()) / 60000)
    : 60;

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      client_id: appt?.client_id ?? "",
      type: appt?.type ?? "consultation",
      starts_at: format(initialStart, "yyyy-MM-dd'T'HH:mm"),
      duration_min: initialDuration,
      notes: appt?.notes ?? "",
    },
  });

  const save = useMutation({
    mutationFn: async (v: z.infer<typeof schema>) => {
      const start = new Date(v.starts_at);
      const end = new Date(start.getTime() + v.duration_min * 60000);
      const payload = {
        client_id: v.client_id,
        type: v.type,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        notes: v.notes || null,
      };
      if (appt) {
        const oldStartIso = appt.starts_at;
        const { data, error } = await supabase.from("appointments").update(payload).eq("id", appt.id).select().single();
        if (error) throw error;
        await logAudit({
          action: "update", module: "appointment", recordId: appt.id,
          recordLabel: format(start, "MMM d, HH:mm"),
          summary: "Appointment updated",
          before: appt as unknown as Record<string, unknown>,
          after: data as unknown as Record<string, unknown>,
        });
        if (new Date(oldStartIso).getTime() !== start.getTime()) {
          await triggerNotificationFn({ data: {
            clientId: v.client_id,
            templateKey: "appointment_rescheduled",
            vars: appointmentVarsClient(start, v.type),
            idempotencyKey: `appt-reschedule-${appt.id}-${start.toISOString()}`,
          }}).catch(() => {});
        }
      } else {
        const { data, error } = await supabase.from("appointments").insert(payload).select().single();
        if (error) throw error;
        await logAudit({
          action: "create", module: "appointment", recordId: data.id,
          recordLabel: format(start, "MMM d, HH:mm"),
          summary: `${v.type} appointment scheduled`,
          after: data as unknown as Record<string, unknown>,
        });
        await triggerNotificationFn({ data: {
          clientId: v.client_id,
          templateKey: "appointment_confirmation",
          vars: appointmentVarsClient(start, v.type),
          idempotencyKey: `appt-confirm-${data.id}`,
        }}).catch(() => {});
      }
    },
    onSuccess: () => { toast.success("Saved"); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async (status: ApptStatus) => {
      if (!appt) return;
      const { data, error } = await supabase.from("appointments").update({ status }).eq("id", appt.id).select().single();
      if (error) throw error;
      await logAudit({
        action: "update", module: "appointment", recordId: appt.id,
        recordLabel: format(new Date(appt.starts_at), "MMM d, HH:mm"),
        summary: `Status changed from "${appt.status}" → "${status}"`,
        before: appt as unknown as Record<string, unknown>,
        after: data as unknown as Record<string, unknown>,
      });
      if (status === "cancelled" && appt.client_id) {
        await triggerNotificationFn({ data: {
          clientId: appt.client_id,
          templateKey: "appointment_cancelled",
          vars: appointmentVarsClient(new Date(appt.starts_at), appt.type),
          idempotencyKey: `appt-cancel-${appt.id}`,
        }}).catch(() => {});
      }
    },
    onSuccess: () => { toast.success("Status updated"); onSaved(); },
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!appt) return;
      const { error } = await supabase.from("appointments").delete().eq("id", appt.id);
      if (error) throw error;
      await logAudit({
        action: "delete", module: "appointment", recordId: appt.id,
        recordLabel: format(new Date(appt.starts_at), "MMM d, HH:mm"),
        summary: "Appointment deleted",
        before: appt as unknown as Record<string, unknown>,
      });
    },
    onSuccess: () => { toast.success("Appointment removed"); onSaved(); },
  });

  return (
    <DialogContent>
      <DialogHeader><DialogTitle className="font-display text-2xl">{appt ? "Edit appointment" : "New appointment"}</DialogTitle></DialogHeader>
      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
        <div>
          <Label>Client</Label>
          <ClientSelect value={form.watch("client_id") || null} onChange={(id) => form.setValue("client_id", id, { shouldValidate: true })} />
          {form.formState.errors.client_id && <p className="text-xs text-destructive">{form.formState.errors.client_id.message}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Type</Label>
            <Select value={form.watch("type")} onValueChange={(v) => form.setValue("type", v as ApptType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Duration (min)</Label>
            <Input type="number" {...form.register("duration_min", { valueAsNumber: true })} />
          </div>
        </div>
        <div>
          <Label>Starts at</Label>
          <Input type="datetime-local" {...form.register("starts_at")} />
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea rows={3} {...form.register("notes")} />
        </div>
        {appt && (
          <div>
            <Label>Status</Label>
            <Select value={appt.status} onValueChange={(s) => updateStatus.mutate(s as ApptStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <div>
            {appt && (
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
