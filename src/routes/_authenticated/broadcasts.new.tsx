import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Search, Send, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  previewBroadcastRecipients,
  searchClientsForBroadcast,
  createBroadcast,
  type RecipientFilter,
} from "@/lib/broadcasts.functions";
import { getMessagingSettings } from "@/lib/messaging.functions";

export const Route = createFileRoute("/_authenticated/broadcasts/new")({
  component: NewBroadcastPage,
});

type Channel = "sms" | "email" | "both";
type ClientHit = {
  id: string;
  full_name: string;
  display_id: string;
  phone: string | null;
  email: string | null;
  sms_opt_in: boolean;
};

function NewBroadcastPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [filter, setFilter] = useState<RecipientFilter>({});
  const [channel, setChannel] = useState<Channel>("sms");
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");

  const navigate = useNavigate();
  const previewFn = useServerFn(previewBroadcastRecipients);
  const createFn = useServerFn(createBroadcast);
  const settingsFn = useServerFn(getMessagingSettings);

  const { data: settings } = useQuery({
    queryKey: ["messaging-settings"],
    queryFn: () => settingsFn(),
  });
  const smsRate = Number(
    (settings as { sms_cost_per_segment?: number | string } | undefined)?.sms_cost_per_segment ??
      0.0079,
  );

  const preview = useQuery({
    queryKey: ["broadcast-preview", filter, channel],
    queryFn: () => previewFn({ data: { filter, channel } }),
    enabled: hasFilter(filter),
  });

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          filter,
          channel,
          body,
          email_subject: channel === "sms" ? undefined : subject,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Broadcast queued for ${r.total} recipient(s)`);
      navigate({ to: "/broadcasts/$id", params: { id: r.broadcastId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl">New Broadcast</h1>
          <p className="text-sm text-muted-foreground">Step {step} of 3</p>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/inbox">
            <X className="mr-1.5 size-4" /> Cancel
          </Link>
        </Button>
      </div>

      {step === 1 && (
        <RecipientsStep
          filter={filter}
          setFilter={setFilter}
          preview={preview.data}
          onNext={() => hasFilter(filter) && setStep(2)}
        />
      )}
      {step === 2 && (
        <ComposeStep
          channel={channel}
          setChannel={setChannel}
          body={body}
          setBody={setBody}
          subject={subject}
          setSubject={setSubject}
          sampleName={preview.data?.sample?.[0]?.name ?? "Sarah"}
          onBack={() => setStep(1)}
          onNext={() => {
            if (!body.trim()) return toast.error("Message body is required");
            if ((channel === "email" || channel === "both") && !subject.trim())
              return toast.error("Email subject is required");
            setStep(3);
          }}
        />
      )}
      {step === 3 && (
        <ConfirmStep
          filter={filter}
          channel={channel}
          body={body}
          subject={subject}
          preview={preview.data}
          smsRate={smsRate}
          isPending={create.isPending}
          onBack={() => setStep(2)}
          onSend={() => create.mutate()}
        />
      )}
    </div>
  );
}

function hasFilter(f: RecipientFilter) {
  return !!(
    f.allActive ||
    f.upcomingThisWeek ||
    f.outstandingBalance ||
    f.inRepair ||
    f.customClientIds?.length
  );
}

function RecipientsStep({
  filter,
  setFilter,
  preview,
  onNext,
}: {
  filter: RecipientFilter;
  setFilter: (f: RecipientFilter) => void;
  preview?: {
    total: number;
    reachable: number;
    optedOut: number;
    sample: { id: string; name: string; display_id: string }[];
  };
  onNext: () => void;
}) {
  const [q, setQ] = useState("");
  const searchFn = useServerFn(searchClientsForBroadcast);
  const search = useQuery({
    queryKey: ["bcast-search", q],
    queryFn: () => searchFn({ data: { q } }),
    enabled: q.trim().length > 1,
  });

  const customIds = filter.customClientIds ?? [];
  const [customClients, setCustomClients] = useState<ClientHit[]>([]);

  const toggleCustom = (c: ClientHit) => {
    if (customIds.includes(c.id)) {
      setFilter({ ...filter, customClientIds: customIds.filter((x) => x !== c.id) });
      setCustomClients(customClients.filter((x) => x.id !== c.id));
    } else {
      setFilter({ ...filter, customClientIds: [...customIds, c.id] });
      setCustomClients([...customClients, c]);
    }
  };

  const opt = (key: keyof RecipientFilter, label: string, desc: string) => (
    <label className="flex items-start gap-3 rounded-lg border border-border/60 p-3 cursor-pointer hover:bg-muted/40">
      <Checkbox
        checked={!!filter[key]}
        onCheckedChange={(v) => setFilter({ ...filter, [key]: !!v })}
      />
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </label>
  );

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="text-sm font-semibold">Choose recipients</div>
        <div className="space-y-2">
          {opt("allActive", "All active clients", "Every client marked as active.")}
          {opt(
            "upcomingThisWeek",
            "Clients with upcoming appointments this week",
            "Next 7 days, scheduled or confirmed appointments.",
          )}
          {opt(
            "outstandingBalance",
            "Clients with payment activity",
            "Clients with at least one non-voided payment on file.",
          )}
          {opt(
            "inRepair",
            "Clients with wigs currently in repair",
            "Active repair tickets (sent / in-progress / issue).",
          )}
        </div>

        <div className="space-y-2 pt-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Custom selection — search by name or CLT ID
          </Label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search clients…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {q.trim().length > 1 && (
            <div className="max-h-48 overflow-y-auto rounded-md border border-border/60">
              {(search.data ?? []).map((c) => {
                const hit = c as ClientHit;
                const selected = customIds.includes(hit.id);
                return (
                  <button
                    key={hit.id}
                    onClick={() => toggleCustom(hit)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 ${
                      selected ? "bg-muted/60" : ""
                    }`}
                  >
                    <span>
                      {hit.full_name}{" "}
                      <span className="text-xs text-muted-foreground">{hit.display_id}</span>
                    </span>
                    {selected && <Badge variant="secondary">Selected</Badge>}
                  </button>
                );
              })}
              {(search.data ?? []).length === 0 && (
                <div className="px-3 py-4 text-xs text-center text-muted-foreground">
                  No clients found.
                </div>
              )}
            </div>
          )}
          {customClients.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {customClients.map((c) => (
                <Badge key={c.id} variant="secondary" className="gap-1">
                  {c.full_name}
                  <button onClick={() => toggleCustom(c)} className="ml-0.5">
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border/60 pt-4">
          <div className="text-sm">
            {preview ? (
              <>
                <span className="font-semibold">{preview.reachable}</span> reachable
                {preview.total !== preview.reachable && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {preview.total - preview.reachable} unreachable
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">Pick at least one filter</span>
            )}
          </div>
          <Button onClick={onNext} disabled={!preview || preview.reachable === 0}>
            Next <ArrowRight className="ml-1.5 size-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ComposeStep({
  channel,
  setChannel,
  body,
  setBody,
  subject,
  setSubject,
  sampleName,
  onBack,
  onNext,
}: {
  channel: Channel;
  setChannel: (c: Channel) => void;
  body: string;
  setBody: (s: string) => void;
  subject: string;
  setSubject: (s: string) => void;
  sampleName: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const segments = Math.max(1, Math.ceil(body.length / 160));
  const preview = useMemo(
    () =>
      body
        .split("[First Name]")
        .join(sampleName.split(" ")[0] ?? sampleName)
        .split("[Last Name]")
        .join(sampleName.split(" ").slice(1).join(" "))
        .split("[CLT ID]")
        .join("CLT-000123")
        .split("[Appointment Date]")
        .join("Monday, June 22")
        .split("[Balance]")
        .join("$240.00"),
    [body, sampleName],
  );
  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="text-sm font-semibold">Compose message</div>
        <div className="flex gap-2">
          {(["sms", "email", "both"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setChannel(c)}
              className={`px-3 py-1.5 text-xs rounded-md border ${
                channel === c
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-muted"
              }`}
            >
              {c === "sms" ? "SMS" : c === "email" ? "Email" : "Both"}
            </button>
          ))}
        </div>

        {(channel === "email" || channel === "both") && (
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Email subject
            </Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Message body
          </Label>
          <Textarea
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Hi [First Name], …"
          />
          {(channel === "sms" || channel === "both") && (
            <div className="text-[11px] text-muted-foreground flex items-center justify-between">
              <span>
                {body.length} chars · {segments} SMS segment{segments > 1 ? "s" : ""} per recipient
              </span>
              <span className="italic opacity-70">
                "Reply STOP to unsubscribe" is appended automatically
              </span>
            </div>
          )}
        </div>

        <div className="text-[11px] text-muted-foreground">
          Variables:{" "}
          {["[First Name]", "[Last Name]", "[Appointment Date]", "[Balance]", "[CLT ID]"].map(
            (v) => (
              <code key={v} className="rounded bg-muted px-1 mr-1">
                {v}
              </code>
            ),
          )}
        </div>

        <div className="rounded-md border border-dashed border-border/60 p-3 bg-muted/30">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Preview (for {sampleName})
          </div>
          {channel !== "sms" && subject && <div className="font-medium text-sm mb-1">{subject}</div>}
          <div className="text-sm whitespace-pre-wrap">{preview || "—"}</div>
        </div>

        <div className="flex items-center justify-between border-t border-border/60 pt-4">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="mr-1.5 size-4" /> Back
          </Button>
          <Button onClick={onNext}>
            Next <ArrowRight className="ml-1.5 size-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfirmStep({
  channel,
  body,
  subject,
  preview,
  smsRate,
  isPending,
  onBack,
  onSend,
}: {
  filter: RecipientFilter;
  channel: Channel;
  body: string;
  subject: string;
  preview?: { total: number; reachable: number; sample: { name: string }[] };
  smsRate: number;
  isPending: boolean;
  onBack: () => void;
  onSend: () => void;
}) {
  const total = preview?.reachable ?? 0;
  const segments = Math.max(1, Math.ceil(body.length / 160));
  const smsCount = channel === "email" ? 0 : total;
  const cost = smsCount * segments * smsRate;
  const sampleName = preview?.sample?.[0]?.name ?? "Sarah";
  const previewBody = body.split("[First Name]").join(sampleName.split(" ")[0] ?? sampleName);
  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="text-sm font-semibold">Preview & confirm</div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border border-border/60 p-3">
            <div className="text-xs text-muted-foreground">Total recipients</div>
            <div className="text-xl font-semibold">{total}</div>
          </div>
          <div className="rounded-md border border-border/60 p-3">
            <div className="text-xs text-muted-foreground">Channel</div>
            <div className="text-xl font-semibold capitalize">{channel}</div>
          </div>
          {channel !== "email" && (
            <div className="rounded-md border border-border/60 p-3 col-span-2">
              <div className="text-xs text-muted-foreground">Estimated SMS cost</div>
              <div className="text-xl font-semibold">~${cost.toFixed(2)}</div>
              <div className="text-[10px] text-muted-foreground">
                {smsCount} × {segments} segment{segments > 1 ? "s" : ""} × ${smsRate.toFixed(4)}
              </div>
            </div>
          )}
        </div>
        <div className="rounded-md border border-dashed border-border/60 p-3 bg-muted/30">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Preview for {sampleName}
          </div>
          {channel !== "sms" && <div className="font-medium text-sm mb-1">{subject}</div>}
          <div className="text-sm whitespace-pre-wrap">{previewBody}</div>
        </div>
        <div className="flex items-center justify-between border-t border-border/60 pt-4">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="mr-1.5 size-4" /> Back
          </Button>
          <Button onClick={onSend} disabled={isPending || total === 0} size="lg">
            <Send className="mr-1.5 size-4" />
            {isPending ? "Sending…" : `Send to ${total} client${total === 1 ? "" : "s"}`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
