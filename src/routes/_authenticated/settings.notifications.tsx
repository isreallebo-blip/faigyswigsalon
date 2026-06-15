import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronDown, RotateCcw, Save } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  getMessagingSettings,
  updateMessagingSettings,
  resetTemplate,
  type DayKey,
} from "@/lib/notification-settings.functions";
import { listTemplates, updateTemplate } from "@/lib/notifications/notifications.functions";

export const Route = createFileRoute("/_authenticated/settings/notifications")({
  component: NotificationsSettingsPage,
});

const DAYS: { key: DayKey; label: string }[] = [
  { key: "sun", label: "Sunday" },
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
];

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Asia/Jerusalem",
  "Europe/London",
];

const VARS_ALL = "[First Name] [Last Name] [Date] [Time] [Hebrew Date] [Amount] [CLT ID] [Appointment Type] [Wig Description]";

type DayHours = { enabled: boolean; open: string; close: string };
type BusinessHours = Record<DayKey, DayHours>;

function defaultHours(): BusinessHours {
  return {
    sun: { enabled: false, open: "09:00", close: "18:00" },
    mon: { enabled: true, open: "09:00", close: "18:00" },
    tue: { enabled: true, open: "09:00", close: "18:00" },
    wed: { enabled: true, open: "09:00", close: "18:00" },
    thu: { enabled: true, open: "09:00", close: "18:00" },
    fri: { enabled: true, open: "09:00", close: "13:00" },
    sat: { enabled: false, open: "09:00", close: "18:00" },
  };
}

function NotificationsSettingsPage() {
  return (
    <div className="space-y-8">
      <header>
        <h2 className="font-display text-2xl">Notifications</h2>
        <p className="text-sm text-muted-foreground">Business hours, auto-replies, and per-event message templates.</p>
      </header>

      <BusinessHoursSection />
      <AutoReplySection />
      <NotificationTogglesSection />
      <TemplateEditorSection />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — Business hours
// ─────────────────────────────────────────────────────────────────────────────
function BusinessHoursSection() {
  const get = useServerFn(getMessagingSettings);
  const update = useServerFn(updateMessagingSettings);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["messaging-settings"],
    queryFn: () => get(),
  });

  const [hours, setHours] = useState<BusinessHours>(defaultHours());
  const [tz, setTz] = useState("America/New_York");

  useEffect(() => {
    if (!data) return;
    const bh = (data.business_hours as unknown as Partial<BusinessHours>) ?? {};
    const merged = defaultHours();
    (Object.keys(merged) as DayKey[]).forEach((k) => {
      if (bh[k]) merged[k] = bh[k]!;
    });
    setHours(merged);
    setTz((data.timezone as string) ?? "America/New_York");
  }, [data]);

  const save = useMutation({
    mutationFn: () => update({ data: { business_hours: hours, timezone: tz } }),
    onSuccess: () => {
      toast.success("Business hours saved");
      qc.invalidateQueries({ queryKey: ["messaging-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business hours</CardTitle>
        <CardDescription>Used to decide when out-of-hours auto-replies are sent.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <div className="space-y-2">
              {DAYS.map(({ key, label }) => {
                const d = hours[key];
                return (
                  <div key={key} className="grid grid-cols-[120px_60px_1fr_auto_1fr] items-center gap-3">
                    <div className="text-sm">{label}</div>
                    <Switch
                      checked={d.enabled}
                      onCheckedChange={(v) => setHours((h) => ({ ...h, [key]: { ...h[key], enabled: v } }))}
                    />
                    <Input
                      type="time"
                      value={d.open}
                      disabled={!d.enabled}
                      onChange={(e) => setHours((h) => ({ ...h, [key]: { ...h[key], open: e.target.value } }))}
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <Input
                      type="time"
                      value={d.close}
                      disabled={!d.enabled}
                      onChange={(e) => setHours((h) => ({ ...h, [key]: { ...h[key], close: e.target.value } }))}
                    />
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-[120px_1fr] items-center gap-3">
              <Label>Timezone</Label>
              <Select value={tz} onValueChange={setTz}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                <Save className="size-4" /> Save business hours
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — Auto-reply
// ─────────────────────────────────────────────────────────────────────────────
function AutoReplySection() {
  const get = useServerFn(getMessagingSettings);
  const update = useServerFn(updateMessagingSettings);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["messaging-settings"], queryFn: () => get() });

  const [body, setBody] = useState(
    "Hi [First Name], thank you for your message! We'll get back to you during business hours.\n— Faigy's Wig Salon",
  );
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (!data) return;
    setBody((data.auto_reply_body as string) ?? body);
    setEnabled(Boolean(data.auto_reply_enabled));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const save = useMutation({
    mutationFn: () => update({ data: { auto_reply_body: body, auto_reply_enabled: enabled } }),
    onSuccess: () => {
      toast.success("Auto-reply saved");
      qc.invalidateQueries({ queryKey: ["messaging-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Out-of-hours auto-reply</CardTitle>
        <CardDescription>Sent automatically when a client messages outside business hours.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
          <Label>Auto-reply enabled</Label>
        </div>
        <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
        <p className="text-xs text-muted-foreground">
          Available variables: <code className="font-mono">[First Name]</code> <code className="font-mono">[Last Name]</code>
        </p>
        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="size-4" /> Save auto-reply
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 3 — Notification toggles
// ─────────────────────────────────────────────────────────────────────────────
const CATEGORY_LABELS: Record<string, string> = {
  appointment: "Appointment notifications",
  repair: "Repair notifications",
  wig: "Order notifications",
  payment: "Payment notifications",
  wash_set: "Wash & Set notifications",
  Portal: "Portal notifications",
};

const DESCRIPTIONS: Record<string, string> = {
  appointment_confirmation: "Sent when an appointment is booked",
  appointment_reminder_24h: "Sent 24 hours before the appointment",
  appointment_reminder_2h: "Sent 2 hours before the appointment",
  appointment_rescheduled: "Sent when an appointment is rescheduled",
  appointment_cancelled: "Sent when an appointment is cancelled",
  wig_sent_to_repair: "Sent when a wig is dropped off for repair",
  wig_ready_for_pickup: "Sent when a wig is ready to pick up",
  custom_order_arrived: "Sent when a custom order arrives at the salon",
  payment_received: "SMS confirmation after a payment is received",
  payment_receipt: "Email receipt after a payment is received",
  outstanding_balance: "Reminder for clients with an outstanding balance",
  wash_set_dropoff: "Sent when a wig is dropped off for wash & set",
  wash_set_ready: "Sent when the wig is washed and ready for styling",
};

type Tpl = {
  id: string;
  key: string;
  label: string;
  category: string;
  enabled: boolean;
  send_sms: boolean;
  send_email: boolean;
  sms_body: string;
  email_subject: string;
  email_body: string | null;
};

function NotificationTogglesSection() {
  const list = useServerFn(listTemplates);
  const update = useServerFn(updateTemplate);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["templates"], queryFn: () => list() });

  const [local, setLocal] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!data?.rows) return;
    const init: Record<string, boolean> = {};
    (data.rows as Tpl[]).forEach((t) => { init[t.id] = t.enabled; });
    setLocal(init);
  }, [data]);

  const grouped = useMemo(() => {
    const rows = (data?.rows ?? []) as Tpl[];
    const map = new Map<string, Tpl[]>();
    rows.forEach((r) => {
      const arr = map.get(r.category) ?? [];
      arr.push(r);
      map.set(r.category, arr);
    });
    return map;
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const rows = (data?.rows ?? []) as Tpl[];
      for (const t of rows) {
        if (local[t.id] !== t.enabled) {
          await update({ data: { id: t.id, enabled: local[t.id] } });
        }
      }
    },
    onSuccess: () => {
      toast.success("Notification toggles saved");
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification toggles</CardTitle>
        <CardDescription>Turn each notification type on or off globally. Changes take effect immediately.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {Array.from(grouped.entries()).map(([cat, rows]) => (
          <div key={cat} className="space-y-2">
            <div className="text-sm font-semibold">{CATEGORY_LABELS[cat] ?? cat}</div>
            <div className="rounded-md border divide-y">
              {rows.map((t) => {
                const channel = t.send_sms && t.send_email ? "Both" : t.send_sms ? "SMS" : t.send_email ? "Email" : "—";
                return (
                  <div key={t.id} className="flex items-center gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{t.label}</div>
                      <div className="text-xs text-muted-foreground">{DESCRIPTIONS[t.key] ?? "—"}</div>
                    </div>
                    <Badge variant="secondary">{channel}</Badge>
                    <Switch
                      checked={local[t.id] ?? t.enabled}
                      onCheckedChange={(v) => setLocal((s) => ({ ...s, [t.id]: v }))}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="size-4" /> Save toggles
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 4 — Template editor
// ─────────────────────────────────────────────────────────────────────────────
function TemplateEditorSection() {
  const list = useServerFn(listTemplates);
  const { data } = useQuery({ queryKey: ["templates"], queryFn: () => list() });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification templates</CardTitle>
        <CardDescription>Click any row to expand and edit. Changes save per template.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {((data?.rows ?? []) as Tpl[]).map((t) => (
          <TemplateRow key={t.id} t={t} />
        ))}
      </CardContent>
    </Card>
  );
}

function TemplateRow({ t }: { t: Tpl }) {
  const update = useServerFn(updateTemplate);
  const reset = useServerFn(resetTemplate);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [smsBody, setSmsBody] = useState(t.sms_body ?? "");
  const [subject, setSubject] = useState(t.email_subject ?? "");
  const [emailBody, setEmailBody] = useState(t.email_body ?? "");

  useEffect(() => {
    setSmsBody(t.sms_body ?? "");
    setSubject(t.email_subject ?? "");
    setEmailBody(t.email_body ?? "");
  }, [t]);

  const save = useMutation({
    mutationFn: () =>
      update({
        data: {
          id: t.id,
          sms_body: smsBody,
          email_subject: subject,
          email_body: emailBody,
        },
      }),
    onSuccess: () => {
      toast.success("Template saved");
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetMut = useMutation({
    mutationFn: () => reset({ data: { id: t.id } }),
    onSuccess: () => {
      toast.success("Template reset to default");
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const channel = t.send_sms && t.send_email ? "Both" : t.send_sms ? "SMS" : t.send_email ? "Email" : "—";

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border">
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition">
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{t.label}</div>
            <div className="text-xs text-muted-foreground">{CATEGORY_LABELS[t.category] ?? t.category}</div>
          </div>
          <Badge variant="secondary">{channel}</Badge>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="p-4 pt-0 space-y-3 border-t">
        {t.send_sms && (
          <div className="space-y-1">
            <Label>SMS message</Label>
            <Textarea rows={4} value={smsBody} onChange={(e) => setSmsBody(e.target.value)} />
          </div>
        )}
        {t.send_email && (
          <>
            <div className="space-y-1">
              <Label>Email subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Email body</Label>
              <Textarea rows={6} value={emailBody} onChange={(e) => setEmailBody(e.target.value)} />
            </div>
          </>
        )}
        <p className="text-xs text-muted-foreground">
          Available variables: <span className="font-mono">{VARS_ALL}</span>
        </p>
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => resetMut.mutate()} disabled={resetMut.isPending}>
            <RotateCcw className="size-3.5" /> Reset to default
          </Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="size-3.5" /> Save template
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
