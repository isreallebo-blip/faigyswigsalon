import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  MessageSquare,
  Mail,
  Database,
  ShieldCheck,
  HardDrive,
  KeyRound,
  Send,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { getMyAccess } from "@/lib/admin-users.functions";
import {
  runHealthChecks,
  sendTestSms,
  sendTestEmail,
  type HealthResult,
} from "@/lib/system-health.functions";
import { useMyProfile } from "@/lib/use-profile";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/settings/system-health")({
  beforeLoad: async () => {
    try {
      const access = await getMyAccess();
      if (!access.isAdmin) throw redirect({ to: "/" });
    } catch (e) {
      if (e && typeof e === "object" && "to" in e) throw e;
      throw redirect({ to: "/" });
    }
  },
  component: SystemHealthPage,
});

const DEFAULT_TEST_SMS =
  "Hi, this is a test message from Faigy's Wig Salon. If you received this, your SMS integration is working correctly! — Faigy's Wig Salon";

type CheckKey = "twilio" | "resend" | "db" | "auth" | "storage" | "env";

function StatusBadge({ status, loading }: { status?: HealthResult["status"]; loading?: boolean }) {
  if (loading) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking…
      </Badge>
    );
  }
  if (status === "healthy") {
    return (
      <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
        <CheckCircle2 className="h-3 w-3" /> Healthy
      </Badge>
    );
  }
  if (status === "warning") {
    return (
      <Badge className="gap-1 bg-amber-500 hover:bg-amber-500 text-black">
        <AlertTriangle className="h-3 w-3" /> Warning
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" /> Error
      </Badge>
    );
  }
  return <Badge variant="outline">Unknown</Badge>;
}

function CheckCard({
  title,
  icon: Icon,
  result,
  loading,
  checkedAt,
  onRecheck,
  children,
}: {
  title: string;
  icon: typeof MessageSquare;
  result?: HealthResult;
  loading: boolean;
  checkedAt?: string | null;
  onRecheck: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
        <div className="flex items-center gap-2">
          <StatusBadge status={result?.status} loading={loading} />
          <Button size="sm" variant="ghost" onClick={onRecheck} disabled={loading}>
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            <span className="ml-1">Recheck</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">
          {loading ? "Checking…" : result?.message ?? "—"}
        </p>
        {result?.detail && (
          <p className="text-xs text-muted-foreground">{result.detail}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Last checked: {checkedAt ? new Date(checkedAt).toLocaleString() : "—"}
        </p>
        {children}
      </CardContent>
    </Card>
  );
}

function SystemHealthPage() {
  const runFn = useServerFn(runHealthChecks);
  const sendSmsFn = useServerFn(sendTestSms);
  const sendEmailFn = useServerFn(sendTestEmail);
  const { data: profile } = useMyProfile();

  const q = useQuery({
    queryKey: ["system-health"],
    queryFn: () => runFn(),
    refetchOnWindowFocus: false,
    gcTime: 0,
    staleTime: 0,
  });

  // Re-run on mount (no cache)
  useEffect(() => {
    q.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checks = q.data?.checks;
  const checkedAt = q.data?.checkedAt;
  const loading = q.isFetching;

  const summary = useMemo(() => {
    if (!checks) return null;
    const all = Object.values(checks);
    const issues = all.filter((c) => c.status !== "healthy");
    return { total: all.length, issues: issues.length };
  }, [checks]);

  // SMS test state
  const [smsTo, setSmsTo] = useState("");
  const [smsBody, setSmsBody] = useState(DEFAULT_TEST_SMS);
  useEffect(() => {
    if (profile?.phone && !smsTo) setSmsTo(profile.phone);
  }, [profile?.phone, smsTo]);

  const smsMutation = useMutation({
    mutationFn: (vars: { to: string; body: string }) => sendSmsFn({ data: vars }),
    onSuccess: async (res, vars) => {
      if (res.ok) {
        toast.success(`Test SMS sent to ${vars.to}`);
        await logAudit({
          action: "create",
          module: "settings",
          summary: `Sent a test SMS to ${vars.to}`,
        });
      } else {
        toast.error(`Failed to send — ${res.error}`);
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to send"),
  });

  // Email test state
  const [emailTo, setEmailTo] = useState("");
  useEffect(() => {
    if (profile?.email && !emailTo) setEmailTo(profile.email);
  }, [profile?.email, emailTo]);

  const emailMutation = useMutation({
    mutationFn: (vars: { to: string }) => sendEmailFn({ data: vars }),
    onSuccess: async (res, vars) => {
      if (res.ok) {
        toast.success(`Test email sent to ${vars.to}`);
        await logAudit({
          action: "create",
          module: "settings",
          summary: `Sent a test email to ${vars.to}`,
        });
      } else {
        toast.error(`Failed to send — ${res.error}`);
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to send"),
  });

  const recheck = (_key: CheckKey) => q.refetch();

  const smsResult = smsMutation.data;
  const emailResult = emailMutation.data;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl">System Health</h2>
          <p className="text-sm text-muted-foreground">
            Verify all integrations are connected and working before going live.
          </p>
        </div>
        <Button onClick={() => q.refetch()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Run all checks
        </Button>
      </div>

      {summary && (
        <div
          className={`rounded-md border p-4 text-sm ${
            summary.issues === 0
              ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {summary.issues === 0
            ? "All systems operational"
            : `${summary.issues} issue${summary.issues === 1 ? "" : "s"} found — see details below`}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <CheckCard
          title="Twilio SMS"
          icon={MessageSquare}
          result={checks?.twilio}
          loading={loading}
          checkedAt={checkedAt}
          onRecheck={() => recheck("twilio")}
        >
          <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <p className="text-sm font-medium">Send a test SMS</p>
            <div className="space-y-2">
              <Label htmlFor="sms-to">Phone number</Label>
              <Input
                id="sms-to"
                placeholder="+15551234567"
                value={smsTo}
                onChange={(e) => setSmsTo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sms-body">Message</Label>
              <Textarea
                id="sms-body"
                rows={4}
                value={smsBody}
                onChange={(e) => setSmsBody(e.target.value)}
                maxLength={1000}
              />
              <p className="text-xs text-muted-foreground text-right">
                {smsBody.length} chars
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => smsMutation.mutate({ to: smsTo.trim(), body: smsBody })}
              disabled={
                smsMutation.isPending ||
                !smsTo.trim() ||
                !smsBody.trim() ||
                checks?.twilio?.status === "error"
              }
            >
              {smsMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send Test SMS
            </Button>
            {smsResult && (
              <p
                className={`text-xs ${
                  smsResult.ok ? "text-emerald-600" : "text-destructive"
                }`}
              >
                {smsResult.ok
                  ? `Test SMS sent successfully to ${smsTo} — check your phone`
                  : `Failed to send — ${smsResult.error}`}
              </p>
            )}
          </div>
        </CheckCard>

        <CheckCard
          title="Resend Email"
          icon={Mail}
          result={checks?.resend}
          loading={loading}
          checkedAt={checkedAt}
          onRecheck={() => recheck("resend")}
        >
          <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <p className="text-sm font-medium">Send a test email</p>
            <div className="space-y-2">
              <Label htmlFor="email-to">Email address</Label>
              <Input
                id="email-to"
                type="email"
                placeholder="you@example.com"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              onClick={() => emailMutation.mutate({ to: emailTo.trim() })}
              disabled={
                emailMutation.isPending ||
                !emailTo.trim() ||
                checks?.resend?.status === "error"
              }
            >
              {emailMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send Test Email
            </Button>
            {emailResult && (
              <p
                className={`text-xs ${
                  emailResult.ok ? "text-emerald-600" : "text-destructive"
                }`}
              >
                {emailResult.ok
                  ? `Test email sent to ${emailTo} — check your inbox and spam folder`
                  : `Failed to send — ${emailResult.error}`}
              </p>
            )}
          </div>
        </CheckCard>

        <CheckCard
          title="Supabase Database"
          icon={Database}
          result={checks?.db}
          loading={loading}
          checkedAt={checkedAt}
          onRecheck={() => recheck("db")}
        />
        <CheckCard
          title="Supabase Auth"
          icon={ShieldCheck}
          result={checks?.auth}
          loading={loading}
          checkedAt={checkedAt}
          onRecheck={() => recheck("auth")}
        />
        <CheckCard
          title="Supabase Storage"
          icon={HardDrive}
          result={checks?.storage}
          loading={loading}
          checkedAt={checkedAt}
          onRecheck={() => recheck("storage")}
        />
        <CheckCard
          title="Environment Variables"
          icon={KeyRound}
          result={checks?.env}
          loading={loading}
          checkedAt={checkedAt}
          onRecheck={() => recheck("env")}
        />
      </div>
    </div>
  );
}
