import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronDown, RotateCcw, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  getMessagingSettings,
  updateMessagingSettings,
  resetTemplateToDefault,
} from "@/lib/messaging.functions";
import { listTemplates, updateTemplate } from "@/lib/notifications/notifications.functions";

export const Route = createFileRoute("/_authenticated/settings/notifications")({
  component: NotificationsSettings,
});

const DAYS = [
  { key: "sun", label: "Sunday" },
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
] as const;

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Jerusalem",
  "Europe/London",
  "UTC",
];

type DayHours = { open: string; close: string; enabled: boolean };
type BHours = Record<string, DayHours>;

function NotificationsSettings() {
  const get = useServerFn(getMessagingSettings);
  const upd = useServerFn(updateMessagingSettings);
  const { data: settings, refetch } = useQuery({
    queryKey: ["messaging-settings"],
    queryFn: () => get(),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">Notifications</h1>
        <p className="text-sm text-muted-foreground">
          Business hours, auto-reply, notification toggles, and message templates.
        </p>
      </div>

      {settings && (
        <>
          <BusinessHoursSection settings={settings} save={upd} onSaved={refetch} />
          <AutoReplySection settings={settings} save={upd} onSaved={refetch} />
          <SmsCostSection settings={settings} save={upd} onSaved={refetch} />
        </>
      )}

      <TogglesSection />
      <TemplatesSection />
    </div>
  );
}

type Settings = {
  business_hours: BHours;
  timezone: string;
  auto_reply_enabled: boolean;
  auto_reply_body: string;
  sms_cost_per_segment: number | string;
};

function BusinessHoursSection({
  settings,
  save,
  onSaved,
}: {
  settings: unknown;
  save: ReturnType<typeof useServerFn<typeof updateMessagingSettings>>;
  onSaved: () => void;
}) {
  const s = settings as Settings;
  const [hours, setHours] = useState<BHours>(s.business_hours);
  const [tz, setTz] = useState<string>(s.timezone);
  useEffect(() => {
    setHours(s.business_hours);
    setTz(s.timezone);
  }, [s]);

  const m = useMutation({
    mutationFn: () => save({ data: { business_hours: hours, timezone: tz } }),
    onSuccess: () => {
      toast.success("Business hours saved");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg">Business hours</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-[110px_auto_1fr_1fr] items-center gap-3 text-sm">
          {DAYS.map((d) => {
            const h: DayHours = hours[d.key] ?? { open: "09:00", close: "18:00", enabled: false };
            const set = (patch: Partial<DayHours>) =>
              setHours({ ...hours, [d.key]: { ...h, ...patch } });
            return (
              <div key={d.key} className="contents">
                <div className="font-medium">{d.label}</div>
                <Switch checked={h.enabled} onCheckedChange={(v) => set({ enabled: v })} />
                <Input
                  type="time"
                  value={h.open}
                  disabled={!h.enabled}
                  onChange={(e) => set({ open: e.target.value })}
                />
                <Input
                  type="time"
                  value={h.close}
                  disabled={!h.enabled}
                  onChange={(e) => set({ close: e.target.value })}
                />
              </div>
            );
          })}
        </div>
        <div className="grid gap-2 max-w-xs pt-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Timezone</Label>
          <Select value={tz} onValueChange={setTz}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => m.mutate()} disabled={m.isPending}>
          <Save className="mr-1.5 size-3.5" /> Save business hours
        </Button>
      </CardContent>
    </Card>
  );
}

function AutoReplySection({
  settings,
  save,
  onSaved,
}: {
  settings: unknown;
  save: ReturnType<typeof useServerFn<typeof updateMessagingSettings>>;
  onSaved: () => void;
}) {
  const s = settings as Settings;
  const [enabled, setEnabled] = useState(s.auto_reply_enabled);
  const [body, setBody] = useState(s.auto_reply_body);
  useEffect(() => {
    setEnabled(s.auto_reply_enabled);
    setBody(s.auto_reply_body);
  }, [s]);

  const m = useMutation({
    mutationFn: () => save({ data: { auto_reply_enabled: enabled, auto_reply_body: body } }),
    onSuccess: () => {
      toast.success("Auto-reply saved");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center justify-between">
          <span>Out-of-hours auto-reply</span>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="text-xs text-muted-foreground">
          Available variables:{" "}
          <code className="rounded bg-muted px-1">[First Name]</code>{" "}
          <code className="rounded bg-muted px-1">[Last Name]</code>
        </div>
        <Button onClick={() => m.mutate()} disabled={m.isPending}>
          <Save className="mr-1.5 size-3.5" /> Save auto-reply
        </Button>
      </CardContent>
    </Card>
  );
}

function SmsCostSection({
  settings,
  save,
  onSaved,
}: {
  settings: unknown;
  save: ReturnType<typeof useServerFn<typeof updateMessagingSettings>>;
  onSaved: () => void;
}) {
  const s = settings as Settings;
  const [cost, setCost] = useState(String(s.sms_cost_per_segment ?? "0.0079"));
  useEffect(() => setCost(String(s.sms_cost_per_segment ?? "0.0079")), [s]);
  const m = useMutation({
    mutationFn: () => save({ data: { sms_cost_per_segment: Number(cost) } }),
    onSuccess: () => {
      toast.success("SMS rate saved");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg">SMS cost estimate</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 max-w-xs">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Rate per SMS segment (USD)
          </Label>
          <Input
            type="number"
            step="0.0001"
            min="0"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Used to estimate cost in the broadcast composer. Default: $0.0079.
          </p>
        </div>
        <Button onClick={() => m.mutate()} disabled={m.isPending}>
          <Save className="mr-1.5 size-3.5" /> Save rate
        </Button>
      </CardContent>
    </Card>
  );
}

type Template = {
  id: string;
  key: string;
  label: string;
  category: string;
  enabled: boolean;
  send_sms: boolean;
  send_email: boolean;
  sms_body: string;
  email_subject: string;
  email_body: string;
};

const TOGGLE_GROUPS: Array<{ title: string; keys: string[] }> = [
  {
    title: "Appointment notifications",
    keys: [
      "appointment_confirmation",
      "appointment_reminder_24h",
      "appointment_reminder_2h",
      "appointment_rescheduled",
      "appointment_cancelled",
    ],
  },
  { title: "Repair notifications", keys: ["wig_sent_to_repair", "wig_ready_for_pickup"] },
  { title: "Order notifications", keys: ["custom_order_arrived"] },
  {
    title: "Payment notifications",
    keys: ["payment_received", "payment_receipt", "outstanding_balance"],
  },
  { title: "Wash & set notifications", keys: ["wash_set_dropoff", "wash_set_ready"] },
  {
    title: "Portal notifications",
    keys: [
      "portal_invite",
      "portal_password_reset",
      "portal_locked_auto",
      "portal_unlocked",
      "portal_signed_out_all",
    ],
  },
];

const TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  appointment_confirmation: "Sent immediately when an appointment is booked.",
  appointment_reminder_24h: "Sent 24 hours before the appointment start time.",
  appointment_reminder_2h: "Sent 2 hours before the appointment start time.",
  appointment_rescheduled: "Sent when an appointment date or time changes.",
  appointment_cancelled: "Sent when an appointment is cancelled.",
  wig_sent_to_repair: "Sent when a wig is dropped off at a repair vendor.",
  wig_ready_for_pickup: "Sent when a repaired wig returns from the vendor.",
  custom_order_arrived: "Sent when a custom wig order arrives at the salon.",
  payment_received: "SMS confirming payment was received.",
  payment_receipt: "Detailed email receipt for the payment.",
  outstanding_balance: "Reminder for clients with an outstanding balance.",
  wash_set_dropoff: "Sent when a wig is dropped off for wash & set.",
  wash_set_ready: "Sent when the wig is ready for the styling appointment.",
  portal_invite: "Sent when an admin invites a client to the portal.",
  portal_password_reset: "Sent when a password reset is requested.",
  portal_locked_auto: "Sent when the portal account auto-locks after failed logins.",
  portal_unlocked: "Sent when portal access is restored.",
  portal_signed_out_all: "Sent when all portal devices are signed out.",
};

function TogglesSection() {
  const list = useServerFn(listTemplates);
  const upd = useServerFn(updateTemplate);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["templates"], queryFn: () => list() });
  const templates: Template[] = (data?.rows as Template[]) ?? [];
  const byKey = Object.fromEntries(templates.map((t) => [t.key, t]));
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setDraft(Object.fromEntries(templates.map((t) => [t.id, t.enabled])));
  }, [data]);

  const m = useMutation({
    mutationFn: async () => {
      const changes = templates.filter((t) => draft[t.id] !== t.enabled);
      for (const t of changes) {
        await upd({ data: { id: t.id, enabled: draft[t.id] } });
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
        <CardTitle className="font-display text-lg">Notification toggles</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {TOGGLE_GROUPS.map((g) => (
          <div key={g.title} className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{g.title}</div>
            <div className="space-y-1.5">
              {g.keys.map((k) => {
                const t = byKey[k];
                if (!t) return null;
                const channel = t.send_sms && t.send_email ? "Both" : t.send_sms ? "SMS" : "Email";
                return (
                  <div
                    key={t.id}
                    className="flex items-start gap-3 border border-border/60 rounded-lg p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{t.label}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {channel}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {TEMPLATE_DESCRIPTIONS[t.key] ?? ""}
                      </p>
                    </div>
                    <Switch
                      checked={draft[t.id] ?? t.enabled}
                      onCheckedChange={(v) => setDraft({ ...draft, [t.id]: v })}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <Button onClick={() => m.mutate()} disabled={m.isPending}>
          <Save className="mr-1.5 size-3.5" /> Save toggles
        </Button>
      </CardContent>
    </Card>
  );
}

function TemplatesSection() {
  const list = useServerFn(listTemplates);
  const upd = useServerFn(updateTemplate);
  const reset = useServerFn(resetTemplateToDefault);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["templates"], queryFn: () => list() });
  const templates: Template[] = (data?.rows as Template[]) ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg">Notification templates</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {templates.map((t) => (
          <TemplateRow
            key={t.id}
            t={t}
            onSave={async (patch) => {
              await upd({ data: { id: t.id, ...patch } });
              qc.invalidateQueries({ queryKey: ["templates"] });
              toast.success("Template saved");
            }}
            onReset={async () => {
              await reset({ data: { key: t.key } });
              qc.invalidateQueries({ queryKey: ["templates"] });
              toast.success("Reset to default");
            }}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function TemplateRow({
  t,
  onSave,
  onReset,
}: {
  t: Template;
  onSave: (patch: {
    send_sms?: boolean;
    send_email?: boolean;
    sms_body?: string;
    email_subject?: string;
    email_body?: string;
  }) => Promise<void>;
  onReset: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [sms, setSms] = useState(t.sms_body);
  const [subj, setSubj] = useState(t.email_subject);
  const [emailBody, setEmailBody] = useState(t.email_body);
  useEffect(() => {
    setSms(t.sms_body);
    setSubj(t.email_subject);
    setEmailBody(t.email_body);
  }, [t.sms_body, t.email_subject, t.email_body]);
  const channel = t.send_sms && t.send_email ? "Both" : t.send_sms ? "SMS" : "Email";
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border border-border/60 rounded-lg">
      <CollapsibleTrigger className="w-full flex items-center justify-between p-3 text-left">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{t.label}</span>
          <Badge variant="outline" className="text-[10px]">
            {channel}
          </Badge>
        </div>
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="p-4 pt-0 border-t border-border/60 space-y-4">
        {t.send_sms && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              SMS body
            </Label>
            <Textarea rows={3} value={sms} onChange={(e) => setSms(e.target.value)} />
            <div className="text-[10px] text-muted-foreground">
              {sms.length} chars · {Math.max(1, Math.ceil(sms.length / 160))} segment(s)
            </div>
          </div>
        )}
        {t.send_email && (
          <>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Email subject
              </Label>
              <Input value={subj} onChange={(e) => setSubj(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Email body
              </Label>
              {t.email_body === "__RECEIPT__" ? (
                <div className="text-xs italic text-muted-foreground rounded-md border border-dashed border-border/60 p-3">
                  This template uses the built-in receipt layout (not editable from here).
                </div>
              ) : (
                <Textarea
                  rows={6}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                />
              )}
            </div>
          </>
        )}
        <div className="text-[10px] text-muted-foreground">
          Variables:{" "}
          {[
            "[First Name]",
            "[Last Name]",
            "[Date]",
            "[Time]",
            "[Day]",
            "[Hebrew Date]",
            "[Amount]",
            "[CLT ID]",
            "[Appointment Type]",
            "[Appointment Date]",
          ].map((v) => (
            <code key={v} className="rounded bg-muted px-1 mr-1">
              {v}
            </code>
          ))}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() =>
              onSave({
                sms_body: sms,
                email_subject: subj,
                email_body: t.email_body === "__RECEIPT__" ? t.email_body : emailBody,
              })
            }
          >
            <Save className="mr-1.5 size-3.5" /> Save template
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onReset()}>
            <RotateCcw className="mr-1.5 size-3.5" /> Reset to default
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
