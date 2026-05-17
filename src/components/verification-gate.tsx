import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Loader2, Mail, MessageSquare, ShieldCheck } from "lucide-react";
import {
  getVerificationStatus,
  requestVerificationCode,
  verifyCode,
} from "@/lib/verification.functions";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onVerified: () => void;
  reason?: string;
};

export function VerificationGate({ open, onOpenChange, onVerified, reason }: Props) {
  const statusFn = useServerFn(getVerificationStatus);
  const requestFn = useServerFn(requestVerificationCode);
  const verifyFn = useServerFn(verifyCode);
  const qc = useQueryClient();

  const statusQ = useQuery({
    queryKey: ["verif-status"],
    queryFn: () => statusFn(),
    enabled: open,
    staleTime: 5_000,
  });

  const [channel, setChannel] = useState<"email" | "sms" | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(60);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!open) {
      setChannel(null); setChallengeId(null); setExpiresAt(null);
      setCode(""); setError(null); setResendIn(60); setLockedUntil(null);
    }
  }, [open]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!challengeId) return;
    setResendIn(60);
    const t = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [challengeId]);

  // Already verified? Close immediately.
  useEffect(() => {
    if (statusQ.data?.verifiedUntil && new Date(statusQ.data.verifiedUntil).getTime() > Date.now()) {
      onVerified();
      onOpenChange(false);
    }
    if (statusQ.data?.lockedUntil) setLockedUntil(statusQ.data.lockedUntil);
  }, [statusQ.data, onOpenChange, onVerified]);

  const requestMut = useMutation({
    mutationFn: (ch: "email" | "sms") => requestFn({ data: { channel: ch } }),
    onSuccess: (r) => {
      if (!r.ok) {
        if (r.error === "locked" && r.lockedUntil) setLockedUntil(r.lockedUntil);
        setError(r.error ?? "Failed");
        return;
      }
      setChallengeId(r.challengeId!);
      setExpiresAt(r.expiresAt!);
      setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed"),
  });

  const verifyMut = useMutation({
    mutationFn: (c: string) => verifyFn({ data: { challengeId: challengeId!, code: c } }),
    onSuccess: (r) => {
      if (r.ok) {
        qc.invalidateQueries({ queryKey: ["verif-status"] });
        onVerified();
        onOpenChange(false);
      } else {
        if (r.error === "locked" && r.lockedUntil) setLockedUntil(r.lockedUntil);
        const rem = (r as { attemptsRemaining?: number }).attemptsRemaining;
        setError(rem != null ? `Incorrect code, ${rem} attempts remaining` : (r.error ?? "Failed"));
        setCode("");
      }
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed"),
  });

  const codeTimeLeft = useMemo(() => {
    if (!expiresAt) return null;
    const left = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
    const m = Math.floor(left / 60);
    const s = String(left % 60).padStart(2, "0");
    return `${m}:${s}`;
  }, [expiresAt, now]);

  const lockMinutesLeft = useMemo(() => {
    if (!lockedUntil) return 0;
    return Math.max(0, Math.ceil((new Date(lockedUntil).getTime() - now) / 60_000));
  }, [lockedUntil, now]);

  // Lockout view
  if (lockedUntil && lockMinutesLeft > 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Account locked</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>Too many incorrect attempts. Please try again in <strong>{lockMinutesLeft} minute{lockMinutesLeft === 1 ? "" : "s"}</strong>.</p>
            <p className="text-muted-foreground">A security alert has been sent to your email on file.</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const status = statusQ.data;
  const showChannelPicker = !channel && status?.hasEmail && status?.hasPhone;
  const masked = channel === "email" ? status?.maskedEmail : channel === "sms" ? status?.maskedPhone : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Verify it's you
          </DialogTitle>
        </DialogHeader>

        {statusQ.isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : !status?.hasEmail && !status?.hasPhone ? (
          <p className="text-sm text-destructive">
            No email or phone on file. Contact the salon to add a contact method before continuing.
          </p>
        ) : !challengeId ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {reason ?? "For your security we need to verify it's you."}
            </p>
            {showChannelPicker ? (
              <div className="space-y-2">
                <p className="text-sm">Send the 6-digit code to:</p>
                <div className="grid gap-2">
                  <Button variant="outline" onClick={() => { setChannel("email"); requestMut.mutate("email"); }} disabled={requestMut.isPending}>
                    <Mail className="h-4 w-4 mr-2" />
                    {status.maskedEmail}
                  </Button>
                  <Button variant="outline" onClick={() => { setChannel("sms"); requestMut.mutate("sms"); }} disabled={requestMut.isPending}>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    {status.maskedPhone}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm">
                  We'll send a 6-digit code to <strong>{status.maskedEmail ?? status.maskedPhone}</strong>.
                </p>
                <Button
                  onClick={() => {
                    const ch = status.hasEmail ? "email" : "sms";
                    setChannel(ch);
                    requestMut.mutate(ch);
                  }}
                  disabled={requestMut.isPending}
                >
                  {requestMut.isPending ? "Sending…" : "Send code"}
                </Button>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="text-right">
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit code sent to <strong>{masked}</strong>.
              {codeTimeLeft && <span className="ml-2 text-xs">Expires in {codeTimeLeft}</span>}
            </p>
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={code}
                onChange={(v) => {
                  setCode(v);
                  setError(null);
                  if (v.length === 6 && !verifyMut.isPending) verifyMut.mutate(v);
                }}
              >
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot key={i} index={i} className="h-12 w-12 text-lg" />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
            {error && <p className="text-center text-sm text-destructive">{error}</p>}
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                className="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
                disabled={resendIn > 0 || requestMut.isPending}
                onClick={() => channel && requestMut.mutate(channel)}
              >
                {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
              </button>
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Hook that wraps a callback so it only runs after verification.
export function useVerifiedAction() {
  const statusFn = useServerFn(getVerificationStatus);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState<(() => void) | null>(null);

  const run = async (action: () => void, opts?: { reason?: string }) => {
    try {
      const s = await statusFn();
      if (s.verifiedUntil && new Date(s.verifiedUntil).getTime() > Date.now()) {
        action();
        return;
      }
    } catch {
      /* fall through to gate */
    }
    setReason(opts?.reason);
    setPending(() => action);
    setOpen(true);
  };

  const gate = (
    <VerificationGate
      open={open}
      onOpenChange={setOpen}
      reason={reason}
      onVerified={() => {
        const fn = pending;
        setPending(null);
        if (fn) fn();
      }}
    />
  );

  return { run, gate };
}
