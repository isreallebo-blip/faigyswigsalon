import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Download, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type Log = Database["public"]["Tables"]["audit_logs"]["Row"];

const MODULES = ["client", "inventory", "appointment", "repair", "payment", "vendor", "user_management", "settings", "workflow", "custom_order", "bank_account", "bank_transaction"];
const ACTIONS = ["create", "update", "delete", "void", "view"];

export const Route = createFileRoute("/_authenticated/settings/audit-log")({
  head: () => ({ meta: [{ title: "Audit Log — Settings" }] }),
  component: AuditLogPage,
});

function AuditLogPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [user, setUser] = useState("");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["audit-logs", from, to, user, moduleFilter, actionFilter],
    queryFn: async () => {
      let query = supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (from) query = query.gte("created_at", from);
      if (to) query = query.lte("created_at", new Date(`${to}T23:59:59`).toISOString());
      if (user) query = query.ilike("user_name", `%${user}%`);
      if (moduleFilter !== "all") query = query.eq("module", moduleFilter);
      if (actionFilter !== "all") query = query.eq("action", actionFilter as Database["public"]["Enums"]["audit_action"]);
      const { data, error } = await query;
      if (error) throw error;
      return data as Log[];
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return q.data ?? [];
    const s = search.toLowerCase();
    return (q.data ?? []).filter((l) =>
      [l.summary, l.record_label, l.user_name, l.user_email, l.module]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    );
  }, [q.data, search]);

  function exportCsv() {
    const header = ["Timestamp", "User", "Email", "IP", "Module", "Action", "Record", "Summary"];
    const rows = filtered.map((l) => [
      l.created_at,
      l.user_name ?? "",
      l.user_email ?? "",
      l.ip_address ?? "",
      l.module,
      l.action,
      l.record_label ?? l.record_id ?? "",
      l.summary,
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl">Audit log</h2>
        <p className="text-sm text-muted-foreground">
          Tamper-proof record of every action across the system.
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-3 lg:grid-cols-6">
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">User</Label>
            <Input placeholder="Name" value={user} onChange={(e) => setUser(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Module</Label>
            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {MODULES.map((m) => <SelectItem key={m} value={m} className="capitalize">{m.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Action</Label>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {ACTIONS.map((a) => <SelectItem key={a} value={a} className="capitalize">{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Keyword" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{filtered.length} entries</p>
        <Button variant="outline" size="sm" onClick={exportCsv} className="gap-2">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {q.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Record</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap text-xs">{format(new Date(l.created_at), "MMM d, yyyy HH:mm:ss")}</TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium">{l.user_name ?? "—"}</div>
                      <div className="text-muted-foreground">{l.user_email}</div>
                      {l.ip_address && <div className="text-muted-foreground">{l.ip_address}</div>}
                    </TableCell>
                    <TableCell className="text-xs capitalize">{l.module.replace(/_/g, " ")}</TableCell>
                    <TableCell>
                      <Badge variant={l.action === "delete" || l.action === "void" ? "destructive" : "secondary"} className="capitalize">{l.action}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs">{l.record_label ?? l.record_id ?? "—"}</TableCell>
                    <TableCell className="max-w-md text-xs">
                      <div>{l.summary}</div>
                      {l.changes && Object.keys(l.changes as Record<string, unknown>).length > 0 && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-muted-foreground">Changes</summary>
                          <pre className="mt-1 overflow-x-auto rounded bg-muted/40 p-2 text-[10px]">{JSON.stringify(l.changes, null, 2)}</pre>
                        </details>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!filtered.length && (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No entries</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
