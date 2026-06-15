import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  ShieldX,
  Mail,
  Phone,
  KeyRound,
  Send,
  Lock,
  Unlock,
  LogOut,
  Power,
  Clock,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

import {
  getClientPortalAccess,
  sendPortalInvite,
  sendPortalPasswordReset,
  lockClientPortal,
  unlockClientPortal,
  disableClientPortal,
  enableClientPortal,
  signOutAllPortalDevices,
} from "@/lib/portal-admin.functions";

type Status = "not_signed_up" | "active" | "locked" | "disabled" | "pending_verification";

const STATUS_META: Record<Status, { label: string; className: string; icon: React.ReactNode }> = {
  not_signed_up: {
    label: "Not Signed Up",
    className: "bg-muted text-muted-foreground",
    icon: <ShieldOff className="h-3 w-3" />,
  },
  active: {
    label: "Active",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    icon: <ShieldCheck className="h-3 w-3" />,
  },
  locked: {
    label: "Locked",
    className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
    icon: <ShieldAlert className="h-3 w-3" />,
  },
  disabled: {
    label: "Disabled",
    className: "bg-zinc-800 text-zinc-100",
    icon: <ShieldX className="h-3 w-3" />,
  },
  pending_verification: {
    label: "Pending Verification",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    icon: <Clock className="h-3 w-3" />,
  },
};

function fmt(date: string | null | undefined): string {
  if (!date) return "—";
  try {
    return format(new Date(date), "MMM d, yyyy 'at' h:mm a");
  } catch {
    return "—";
  }
}

export function PortalStatusBadge({ status }: { status: Status }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.className}`}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}

export function PortalAccessCard({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const getAccess = useServerFn(getClientPortalAccess);
  const inviteFn = useServerFn(sendPortalInvite);
  const resetFn = useServerFn(sendPortalPasswordReset);
  const lockFn = useServerFn(lockClientPortal);
  const unlockFn = useServerFn(unlockClientPortal);
  const disableFn = useServerFn(disableClientPortal);
  const enableFn = useServerFn(enableClientPortal);
  const signOutFn = useServerFn(signOutAllPortalDevices);

  const [lockOpen, setLockOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [lockReason, setLockReason] = useState<
    "suspicious_activity" | "client_request" | "outstanding_balance" | "other"
  >("suspicious_activity");
  const [lockReasonText, setLockReasonText] = useState("");

  const access = useQuery({
    queryKey: ["portal-access", clientId],
    queryFn: () => getAccess({ data: { clientId } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["portal-access", clientId] });
    qc.invalidateQueries({ queryKey: ["portal-activity", clientId] });
    qc.invalidateQueries({ queryKey: ["clients"] });
    qc.invalidateQueries({ queryKey: ["portal-accounts"] });
  };

  const invite = useMutation({
    mutationFn: () => inviteFn({ data: { clientId } }),
    onSuccess: () => {
      toast.success("Portal invite sent");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const reset = useMutation({
    mutationFn: () => resetFn({ data: { clientId } }),
    onSuccess: (r) => {
      toast.success(`Reset link sent to ${r.maskedTo ?? "client"}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const lock = useMutation({
    mutationFn: () =>
      lockFn({
        data: {
          clientId,
          reason: lockReason,
          reasonText: lockReason === "other" ? lockReasonText : undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Account locked");
      setLockOpen(false);
      setLockReasonText("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const unlock = useMutation({
    mutationFn: () => unlockFn({ data: { clientId } }),
    onSuccess: () => {
      toast.success("Account unlocked");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const disable = useMutation({
    mutationFn: () => disableFn({ data: { clientId } }),
    onSuccess: () => {
      toast.success("Portal access disabled");
      setDisableOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const enable = useMutation({
    mutationFn: () => enableFn({ data: { clientId } }),
    onSuccess: () => {
      toast.success("Portal access re-enabled");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const signOut = useMutation({
    mutationFn: () => signOutFn({ data: { clientId } }),
    onSuccess: () => {
      toast.success("Signed out of all devices");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (access.isLoading || !access.data) {
    return (
      <Card>
        <CardContent className="p-5">
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const a = access.data;
  const s = a.status as Status;
  const signedUp = !!a.authUserId;

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Portal Access
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
              <PortalStatusBadge status={s} />
              {a.smsOptIn === false && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  SMS opted out
                </span>
              )}
            </div>
          </div>
        </div>

        {signedUp && (
          <div className="grid gap-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Signed up</span>
              <span>
                {fmt(a.signupAt)}
                {a.signupMethod && (
                  <span className="ml-1 text-muted-foreground">· via {a.signupMethod}</span>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Last login</span>
              <span>{a.lastLoginAt ? fmt(a.lastLoginAt) : "Never logged in"}</span>
            </div>
            {a.maskedEmail && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground inline-flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" /> Email
                </span>
                <span className="font-mono text-xs">{a.maskedEmail}</span>
              </div>
            )}
            {a.maskedPhone && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" /> Phone
                </span>
                <span className="font-mono text-xs">{a.maskedPhone}</span>
              </div>
            )}
          </div>
        )}

        {s === "locked" && a.lockAuto && (
          <div className="rounded-md bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-800 dark:text-red-200">
            Auto-locked after 5 failed login attempts on {fmt(a.lockedAt)}
          </div>
        )}
        {s === "locked" && !a.lockAuto && a.lockReason && (
          <div className="rounded-md bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-800 dark:text-red-200">
            Locked on {fmt(a.lockedAt)} · Reason: {a.lockReason}
          </div>
        )}

        {a.inviteSentAt && !signedUp && (
          <div className="text-xs text-muted-foreground">
            Invite sent on {fmt(a.inviteSentAt)}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          {!signedUp && (
            <Button
              size="sm"
              onClick={() => invite.mutate()}
              disabled={invite.isPending}
              className="gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              {a.inviteSentAt ? "Resend Invite" : "Send Portal Invite"}
            </Button>
          )}
          {signedUp && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => reset.mutate()}
                disabled={reset.isPending}
                className="gap-1.5"
              >
                <KeyRound className="h-3.5 w-3.5" /> Send Password Reset
              </Button>
              {s !== "locked" && s !== "disabled" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setLockOpen(true)}
                  className="gap-1.5"
                >
                  <Lock className="h-3.5 w-3.5" /> Lock Account
                </Button>
              )}
              {s === "locked" && (
                <Button
                  size="sm"
                  onClick={() => unlock.mutate()}
                  disabled={unlock.isPending}
                  className="gap-1.5"
                >
                  <Unlock className="h-3.5 w-3.5" /> Unlock Account
                </Button>
              )}
              {s !== "disabled" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDisableOpen(true)}
                  className="gap-1.5 text-destructive"
                >
                  <Power className="h-3.5 w-3.5" /> Disable Portal Access
                </Button>
              )}
              {s === "disabled" && (
                <Button
                  size="sm"
                  onClick={() => enable.mutate()}
                  disabled={enable.isPending}
                  className="gap-1.5"
                >
                  <Power className="h-3.5 w-3.5" /> Re-enable Portal Access
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => signOut.mutate()}
                disabled={signOut.isPending}
                className="gap-1.5"
              >
                <LogOut className="h-3.5 w-3.5" /> Sign Out All Devices
              </Button>
            </>
          )}
        </div>
      </CardContent>

      {/* Lock dialog */}
      <Dialog open={lockOpen} onOpenChange={setLockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lock portal account</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Reason
              </Label>
              <Select value={lockReason} onValueChange={(v) => setLockReason(v as typeof lockReason)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="suspicious_activity">Suspicious activity</SelectItem>
                  <SelectItem value="client_request">Client request</SelectItem>
                  <SelectItem value="outstanding_balance">Outstanding balance</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {lockReason === "other" && (
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Details
                </Label>
                <Textarea
                  rows={3}
                  className="mt-1.5"
                  value={lockReasonText}
                  onChange={(e) => setLockReasonText(e.target.value)}
                  placeholder="Describe the reason"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLockOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => lock.mutate()}
              disabled={lock.isPending || (lockReason === "other" && !lockReasonText.trim())}
            >
              Lock account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disable confirm */}
      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable portal access</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to disable portal access for {a.clientName}? They will
            not be able to log in until access is manually restored.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDisableOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => disable.mutate()}
              disabled={disable.isPending}
            >
              Disable access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function PortalAccessTab({ clientId }: { clientId: string }) {
  const getAccess = useServerFn(getClientPortalAccess);
  const access = useQuery({
    queryKey: ["portal-activity", clientId],
    queryFn: () => getAccess({ data: { clientId } }),
  });

  if (access.isLoading || !access.data) {
    return <Skeleton className="h-40 w-full" />;
  }
  const rows = access.data.activity;

  return (
    <div className="space-y-4">
      <PortalAccessCard clientId={clientId} />
      <Card>
        <CardContent className="p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
            Portal Activity Log
          </div>
          {!rows.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No portal activity yet.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="flex items-start justify-between gap-3 text-sm border-b border-border/60 pb-2 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="font-medium">{r.summary}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {fmt(r.created_at)}
                      {r.ip_address && <span> · IP {r.ip_address}</span>}
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        {r.actor}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function PortalStatusDot({ status }: { status: Status }) {
  const color =
    status === "active"
      ? "bg-emerald-500"
      : status === "locked" || status === "disabled"
        ? "bg-red-500"
        : status === "pending_verification"
          ? "bg-amber-500"
          : "bg-zinc-400";
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${color}`}
      title={STATUS_META[status].label}
      aria-label={`Portal: ${STATUS_META[status].label}`}
    />
  );
}
