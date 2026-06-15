import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Send, Search, X, Check, Megaphone } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  previewBroadcast,
  searchClients,
  sendBroadcast,
  type RecipientFilter,
} from "@/lib/broadcast.functions";
import { useAccess } from "@/lib/use-access";

export const Route = createFileRoute("/_authenticated/inbox/new-broadcast")({
  component: NewBroadcastPage,
});

type Channel = "sms" | "email" | "both";

function NewBroadcastPage() {
  const { isAdmin, loading } = useAccess();
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [filter, setFilter] = useState<RecipientFilter>({ all_active: false });
  const [customSelected, setCustomSelected] = useState<Map<string, { full_name: string; display_id: string | null }>>(new Map());
  const [search, setSearch] = useState("");

  const [channel, setChannel] = useState<Channel>("sms");
  const [smsBody, setSmsBody] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  const previewFn = useServerFn(previewBroadcast);
  const searchFn = useServerFn(searchClients);
  const sendFn = useServerFn(sendBroadcast);

  const fullFilter: RecipientFilter = useMemo(() => ({
    ...filter,
    custom_ids: Array.from(customSelected.keys()),
  }), [filter, customSelected]);

  const { data: previewData } = useQuery({
    queryKey: ["broadcast-preview", fullFilter],
    queryFn: () => previewFn({ data: fullFilter }),
  });

  const { data: searchData } = useQuery({
    queryKey: ["broadcast-search", search],
    queryFn: () => searchFn({ data: { q: search } }),
    enabled: search.trim().length > 1,
  });

  const send = useMutation({
    mutationFn: () =>
      sendFn({
        data: {
          filter: fullFilter,
          channel,
          sms_body: smsBody || undefined,
          email_subject: emailSubject || undefined,
          email_body: emailBody || undefined,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Broadcast sent: ${r.sent} delivered, ${r.failed} failed`);
      navigate({ to: "/inbox" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!isAdmin) return <div className="p-6 text-sm text-muted-foreground">Admins only.</div>;

  const total = previewData?.total ?? 0;
  const sampleFirst = previewData?.sample[0]?.first_name ?? "Sarah";
  const previewSms = smsBody.split("[First Name]").join(sampleFirst);
  const previewEmailSubj = emailSubject.split("[First Name]").join(sampleFirst);
  const previewEmailBody = emailBody.split("[First Name]").join(sampleFirst);

  const smsSegments = Math.max(1, Math.ceil(smsBody.length / 160));
  const estCost = (total * 0.0079).toFixed(2);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/inbox"><ArrowLeft className="size-4" /> Back to inbox</Link>
        </Button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Megaphone className="size-4" /> Step {step} of 3
        </div>
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Choose recipients</CardTitle>
            <CardDescription>Pick one or more groups. Combined as a single audience.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { k: "all_active", label: "All active clients" },
              { k: "upcoming_week", label: "Clients with upcoming appointments this week" },
              { k: "in_repair", label: "Clients with wigs currently in repair" },
            ].map((opt) => (
              <label key={opt.k} className="flex items-center gap-3 p-3 rounded-md border cursor-pointer hover:bg-muted/40">
                <Checkbox
                  checked={Boolean(filter[opt.k as keyof RecipientFilter])}
                  onCheckedChange={(v) => setFilter((f) => ({ ...f, [opt.k]: Boolean(v) }))}
                />
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}

            <div className="rounded-md border p-3 space-y-2">
              <div className="text-sm font-medium">Custom selection</div>
              <div className="relative">
                <Search className="size-3.5 absolute left-2 top-2.5 text-muted-foreground" />
                <Input
                  className="pl-7"
                  placeholder="Search clients by name or CLT ID…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {searchData?.rows.length ? (
                <div className="max-h-44 overflow-y-auto border rounded">
                  {searchData.rows.map((c) => {
                    const picked = customSelected.has(c.id as string);
                    return (
                      <button
                        key={c.id as string}
                        onClick={() => {
                          setCustomSelected((m) => {
                            const next = new Map(m);
                            if (picked) next.delete(c.id as string);
                            else next.set(c.id as string, { full_name: c.full_name as string, display_id: c.display_id as string | null });
                            return next;
                          });
                        }}
                        className="w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-muted/50"
                      >
                        <span>{c.full_name as string} <span className="text-xs text-muted-foreground">{c.display_id as string}</span></span>
                        {picked && <Check className="size-3.5 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {customSelected.size > 0 && (
                <div className="flex flex-wrap gap-1">
                  {Array.from(customSelected.entries()).map(([id, c]) => (
                    <Badge key={id} variant="secondary" className="gap-1">
                      {c.full_name}
                      <button onClick={() => setCustomSelected((m) => { const n = new Map(m); n.delete(id); return n; })}>
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="text-sm font-medium">{total} client{total === 1 ? "" : "s"} selected</div>
              <Button onClick={() => setStep(2)} disabled={total === 0}>Continue</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Compose message</CardTitle>
            <CardDescription>Variables fill in per recipient.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={channel} onValueChange={(v) => setChannel(v as Channel)}>
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="sms">SMS</TabsTrigger>
                <TabsTrigger value="email">Email</TabsTrigger>
                <TabsTrigger value="both">Both</TabsTrigger>
              </TabsList>
            </Tabs>

            {(channel === "sms" || channel === "both") && (
              <div className="space-y-2">
                <Label>SMS message</Label>
                <Textarea rows={5} value={smsBody} onChange={(e) => setSmsBody(e.target.value)} placeholder="Hi [First Name], …" />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{smsBody.length} chars · {smsSegments} segment{smsSegments > 1 ? "s" : ""} per recipient</span>
                  <span>Vars: [First Name] [Last Name] [CLT ID]</span>
                </div>
                <div className="text-xs text-muted-foreground italic border-l-2 pl-2">
                  Reply STOP to unsubscribe — appended automatically
                </div>
                {smsBody && (
                  <div className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Preview ({sampleFirst})</div>
                    {previewSms}
                  </div>
                )}
              </div>
            )}

            {(channel === "email" || channel === "both") && (
              <div className="space-y-2">
                <Label>Email subject</Label>
                <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="A note from Faigy's Wig Salon" />
                <Label>Email body</Label>
                <Textarea rows={8} value={emailBody} onChange={(e) => setEmailBody(e.target.value)} placeholder="Hi [First Name], …" />
                {emailBody && (
                  <div className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Preview ({sampleFirst})</div>
                    <div className="font-semibold mb-1">{previewEmailSubj}</div>
                    {previewEmailBody}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => setStep(3)}>Continue</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Preview &amp; confirm</CardTitle>
            <CardDescription>Last check before sending.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-md border p-3 space-y-1">
              <div><span className="text-muted-foreground">Recipients:</span> <strong>{total}</strong></div>
              <div><span className="text-muted-foreground">Channel:</span> <strong>{channel.toUpperCase()}</strong></div>
              {(channel === "sms" || channel === "both") && (
                <div><span className="text-muted-foreground">Estimated SMS cost:</span> ~${estCost} ({total} × $0.0079)</div>
              )}
              <div><span className="text-muted-foreground">Reachable by SMS:</span> {previewData?.with_phone ?? 0}</div>
              <div><span className="text-muted-foreground">Reachable by email:</span> {previewData?.with_email ?? 0}</div>
            </div>

            {(channel === "sms" || channel === "both") && smsBody && (
              <div className="rounded-md bg-muted p-3 whitespace-pre-wrap">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">SMS preview ({sampleFirst})</div>
                {previewSms}
              </div>
            )}
            {(channel === "email" || channel === "both") && emailBody && (
              <div className="rounded-md bg-muted p-3 whitespace-pre-wrap">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Email preview ({sampleFirst})</div>
                <div className="font-semibold mb-1">{previewEmailSubj}</div>
                {previewEmailBody}
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(2)} disabled={send.isPending}>Back</Button>
              <Button onClick={() => send.mutate()} disabled={send.isPending || total === 0} size="lg">
                <Send className="size-4" /> Send to {total} client{total === 1 ? "" : "s"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
