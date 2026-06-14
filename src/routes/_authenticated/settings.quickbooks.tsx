import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link2, Plug, RefreshCw, ShieldCheck, Unplug, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  getIntuitStatus,
  getIntuitAuthorizeUrl,
  disconnectIntuit,
  testIntuitConnection,
  refreshIntuitToken,
} from "@/lib/intuit.functions";

type StatusSearch = { status?: "connected" | "error"; reason?: string };

export const Route = createFileRoute("/_authenticated/settings/quickbooks")({
  validateSearch: (s: Record<string, unknown>): StatusSearch => ({
    status: (s.status as StatusSearch["status"]) ?? undefined,
    reason: (s.reason as string) ?? undefined,
  }),
  component: QuickBooksSettingsPage,
});

function fmt(dateIso: string | null | undefined): string {
  if (!dateIso) return "—";
  try {
    return new Date(dateIso).toLocaleString();
  } catch {
    return dateIso;
  }
}

function QuickBooksSettingsPage() {
  const qc = useQueryClient();
  const search = Route.useSearch();
  const navigate = useNavigate();

  const status = useServerFn(getIntuitStatus);
  const start = useServerFn(getIntuitAuthorizeUrl);
  const disconnect = useServerFn(disconnectIntuit);
  const test = useServerFn(testIntuitConnection);
  const refresh = useServerFn(refreshIntuitToken);

  const statusQ = useQuery({ queryKey: ["intuit-status"], queryFn: () => status() });

  useEffect(() => {
    if (search.status === "connected") {
      toast.success("QuickBooks Payments connected");
      qc.invalidateQueries({ queryKey: ["intuit-status"] });
      navigate({ to: "/settings/quickbooks", search: {}, replace: true });
    } else if (search.status === "error") {
      toast.error(`Could not connect: ${search.reason ?? "unknown error"}`);
      navigate({ to: "/settings/quickbooks", search: {}, replace: true });
    }
  }, [search.status, search.reason, navigate, qc]);

  const connectMut = useMutation({
    mutationFn: () => start({ data: {} as never }),
    onSuccess: (data) => {
      window.location.href = data.connectUrl;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const disconnectMut = useMutation({
    mutationFn: () => disconnect({ data: {} as never }),
    onSuccess: () => {
      toast.success("Disconnected from QuickBooks Payments");
      qc.invalidateQueries({ queryKey: ["intuit-status"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const testMut = useMutation({
    mutationFn: () => test({ data: {} as never }),
    onSuccess: (r) =>
      toast.success(
        `Connection OK — realm ${r.realmId} (${r.environment}). Test token issued: ${r.gotToken ? "yes" : "no"}`,
      ),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Test failed"),
  });

  const refreshMut = useMutation({
    mutationFn: () => refresh({ data: {} as never }),
    onSuccess: (r) => {
      toast.success(`Token refreshed — expires ${fmt(r.accessTokenExpiresAt)}`);
      qc.invalidateQueries({ queryKey: ["intuit-status"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Refresh failed"),
  });

  const s = statusQ.data;
  const connected = !!s?.connected;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl">QuickBooks Payments</h2>
        <p className="text-sm text-muted-foreground">
          Connect your salon's QuickBooks Payments account to charge client cards securely.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-muted p-2">
                <Plug className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Connection</CardTitle>
                <CardDescription>
                  Scope: <code className="text-xs">com.intuit.quickbooks.payment</code>
                </CardDescription>
              </div>
            </div>
            <Badge variant={connected ? "default" : "secondary"}>
              {statusQ.isLoading ? "Loading…" : connected ? "Connected" : "Not connected"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Environment</div>
              <div className="font-medium">{s?.environment ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Company / realmId</div>
              <div className="font-medium font-mono text-xs break-all">{s?.realmId ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Access token expires</div>
              <div className="font-medium">{fmt(s?.accessTokenExpiresAt)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Refresh token expires</div>
              <div className="font-medium">{fmt(s?.refreshTokenExpiresAt)}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            {!connected && (
              <Button onClick={() => connectMut.mutate()} disabled={connectMut.isPending}>
                <Link2 className="h-4 w-4 mr-2" />
                {connectMut.isPending ? "Redirecting…" : "Connect QuickBooks Payments"}
              </Button>
            )}
            {connected && (
              <>
                <Button
                  variant="outline"
                  onClick={() => testMut.mutate()}
                  disabled={testMut.isPending}
                >
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  {testMut.isPending ? "Testing…" : "Test connection"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => refreshMut.mutate()}
                  disabled={refreshMut.isPending}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {refreshMut.isPending ? "Refreshing…" : "Refresh token"}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">
                      <Unplug className="h-4 w-4 mr-2" />
                      Disconnect
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Disconnect QuickBooks Payments?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Saved cards on file will remain in the database but new charges and refunds
                        will fail until you reconnect.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => disconnectMut.mutate()}>
                        Disconnect
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Security notes</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Card numbers and CVVs are <strong>never</strong> stored. Cards are tokenized in the
            browser by Intuit; only the resulting opaque token plus safe metadata (brand, last 4,
            expiration) is sent to our server and vaulted with QuickBooks Payments.
          </p>
          <p>
            OAuth tokens are stored server-side and refreshed automatically. Only admins can
            connect, disconnect, test, or refresh the connection.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
