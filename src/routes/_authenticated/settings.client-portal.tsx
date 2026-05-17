import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search, Download, Mail, Lock, Ban, RotateCcw, Loader2 } from "lucide-react";
import {
  listPortalAccounts,
  bulkPortalAction,
  sendPortalInvite,
  lockClientPortal,
  disableClientPortal,
} from "@/lib/portal-admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/settings/client-portal")({
  component: ClientPortalSettingsPage,
});

type StatusFilter =
  | "all"
  | "active"
  | "locked"
  | "disabled"
  | "pending_verification"
  | "never_logged_in"
  | "not_signed_up";

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  active: { label: "Active", tone: "bg-emerald-100 text-emerald-900" },
  locked: { label: "Locked", tone: "bg-amber-100 text-amber-900" },
  disabled: { label: "Disabled", tone: "bg-red-100 text-red-900" },
  pending_verification: { label: "Pending", tone: "bg-blue-100 text-blue-900" },
  not_signed_up: { label: "Not signed up", tone: "bg-muted text-muted-foreground" },
};

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ClientPortalSettingsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listPortalAccounts);
  const bulk = useServerFn(bulkPortalAction);
  const invite = useServerFn(sendPortalInvite);
  const lock = useServerFn(lockClientPortal);
  const disable = useServerFn(disableClientPortal);

  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: rows, isLoading } = useQuery({
    queryKey: ["portal-accounts", status, search],
    queryFn: () => list({ data: { status, search: search || undefined } }),
  });

  const stats = useMemo(() => {
    const r = rows ?? [];
    return {
      total: r.length,
      active: r.filter((x) => x.portal_status === "active").length,
      locked: r.filter((x) => x.portal_status === "locked").length,
      disabled: r.filter((x) => x.portal_status === "disabled").length,
      not_signed_up: r.filter((x) => !x.auth_user_id).length,
    };
  }, [rows]);

  const allChecked = (rows?.length ?? 0) > 0 && selected.size === rows!.length;

  const refresh = () => qc.invalidateQueries({ queryKey: ["portal-accounts"] });

  const inviteOne = useMutation({
    mutationFn: (id: string) => invite({ data: { clientId: id } }),
    onSuccess: () => {
      toast.success("Invite sent");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message ?? "Failed to send invite"),
  });

  const lockOne = useMutation({
    mutationFn: (id: string) =>
      lock({ data: { clientId: id, reason: "suspicious_activity" } }),
    onSuccess: () => {
      toast.success("Account locked");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message ?? "Failed to lock"),
  });

  const disableOne = useMutation({
    mutationFn: (id: string) => disable({ data: { clientId: id } }),
    onSuccess: () => {
      toast.success("Account disabled");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message ?? "Failed to disable"),
  });

  const bulkRun = useMutation({
    mutationFn: (action: "invite" | "lock" | "disable") =>
      bulk({
        data: {
          clientIds: Array.from(selected),
          action,
          reason: action === "lock" ? "other" : undefined,
        },
      }),
    onSuccess: (res) => {
      toast.success(`Done — ${res.ok} succeeded, ${res.failed} failed`);
      setSelected(new Set());
      refresh();
    },
    onError: (e: Error) => toast.error(e.message ?? "Bulk action failed"),
  });

  const exportCsv = () => {
    const r = rows ?? [];
    const header = [
      "Client ID",
      "Name",
      "Email",
      "Phone",
      "Status",
      "Signed up",
      "Signup method",
      "Last login",
    ];
    const lines = [header.join(",")].concat(
      r.map((c) =>
        [
          c.display_id,
          c.full_name,
          c.email ?? "",
          c.phone ?? "",
          c.auth_user_id ? c.portal_status : "not_signed_up",
          fmtDate(c.portal_signup_at),
          c.portal_signup_method ?? "",
          fmtDate(c.portal_last_login_at),
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      ),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portal-accounts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl">Client Portal</h2>
        <p className="text-sm text-muted-foreground">
          Manage all client portal accounts in one place.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: "Total", value: stats.total },
          { label: "Active", value: stats.active },
          { label: "Locked", value: stats.locked },
          { label: "Disabled", value: stats.disabled },
          { label: "Not signed up", value: stats.not_signed_up },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className="text-2xl font-semibold">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, email, phone, CLT ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="locked">Locked</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
            <SelectItem value="pending_verification">Pending verification</SelectItem>
            <SelectItem value="never_logged_in">Never logged in</SelectItem>
            <SelectItem value="not_signed_up">Not signed up</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={exportCsv}>
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3">
          <span className="text-sm">
            {selected.size} selected
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={bulkRun.isPending}
            onClick={() => bulkRun.mutate("invite")}
          >
            <Mail className="mr-2 h-4 w-4" /> Send invite
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={bulkRun.isPending}
            onClick={() => bulkRun.mutate("lock")}
          >
            <Lock className="mr-2 h-4 w-4" /> Lock
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={bulkRun.isPending}
            onClick={() => {
              if (confirm(`Disable ${selected.size} portal accounts?`)) bulkRun.mutate("disable");
            }}
          >
            <Ban className="mr-2 h-4 w-4" /> Disable
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={(v) => {
                    if (v) setSelected(new Set((rows ?? []).map((r) => r.id)));
                    else setSelected(new Set());
                  }}
                />
              </TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Signed up</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : (rows ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No portal accounts match.
                </TableCell>
              </TableRow>
            ) : (
              (rows ?? []).map((c) => {
                const effective = c.auth_user_id ? c.portal_status : "not_signed_up";
                const meta = STATUS_LABEL[effective] ?? STATUS_LABEL.not_signed_up;
                const checked = selected.has(c.id);
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          const next = new Set(selected);
                          if (v) next.add(c.id);
                          else next.delete(c.id);
                          setSelected(next);
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/clients"
                        search={{ id: c.id } as never}
                        className="font-medium hover:underline"
                      >
                        {c.full_name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {c.display_id} · {c.email ?? c.phone ?? "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={meta.tone} variant="secondary">
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{fmtDate(c.portal_signup_at)}</TableCell>
                    <TableCell className="text-sm">{fmtDate(c.portal_last_login_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {!c.auth_user_id && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={inviteOne.isPending}
                            onClick={() => inviteOne.mutate(c.id)}
                          >
                            <Mail className="mr-1 h-3 w-3" /> Invite
                          </Button>
                        )}
                        {c.auth_user_id && effective === "active" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={lockOne.isPending}
                            onClick={() => lockOne.mutate(c.id)}
                          >
                            <Lock className="mr-1 h-3 w-3" /> Lock
                          </Button>
                        )}
                        {c.auth_user_id && effective !== "disabled" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={disableOne.isPending}
                            onClick={() => {
                              if (confirm(`Disable portal for ${c.full_name}?`)) disableOne.mutate(c.id);
                            }}
                          >
                            <Ban className="mr-1 h-3 w-3" /> Disable
                          </Button>
                        )}
                        <Link to="/clients" search={{ id: c.id } as never}>
                          <Button size="sm" variant="ghost">
                            <RotateCcw className="mr-1 h-3 w-3" /> Open
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
