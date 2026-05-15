import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, CheckCircle2, Circle, Workflow as WorkflowIcon, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClientSelect } from "@/components/client-select";
import { WORKFLOW_STEPS, WORKFLOW_LABEL, type WorkflowType } from "@/lib/workflow-templates";

type Workflow = Database["public"]["Tables"]["service_workflows"]["Row"];
type Step = Database["public"]["Tables"]["workflow_steps"]["Row"];

export const Route = createFileRoute("/_authenticated/workflows")({
  head: () => ({ meta: [{ title: "Service workflows — Faigy's Wig Salon" }] }),
  component: WorkflowsPage,
});

function WorkflowsPage() {
  const [tab, setTab] = useState<"open" | "completed">("open");
  const [openDialog, setOpenDialog] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["workflows", tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_workflows")
        .select("*, client:client_id(full_name, display_id), wig:wig_id(brand, style, wig_code, display_id)")
        .eq("status", tab === "open" ? "open" : "completed")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as (Workflow & {
        client: { full_name: string; display_id: string } | null;
        wig: { brand: string | null; style: string | null; wig_code: string | null; display_id: string } | null;
      })[];
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Operations</p>
          <h1 className="mt-1 font-display text-4xl">Service workflows</h1>
        </div>
        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> New workflow</Button>
          </DialogTrigger>
          <NewWorkflowDialog
            onClose={() => setOpenDialog(false)}
            onCreated={(id) => {
              qc.invalidateQueries({ queryKey: ["workflows"] });
              setOpenDialog(false);
              setActive(id);
            }}
          />
        </Dialog>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4 space-y-3">
          {list.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !list.data?.length ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                <WorkflowIcon className="mx-auto h-6 w-6 text-gold" />
                <p className="mt-3 font-display text-lg text-foreground">No {tab} workflows</p>
              </CardContent>
            </Card>
          ) : (
            list.data.map((w) => (
              <button
                key={w.id}
                onClick={() => setActive(w.id)}
                className="w-full text-left"
              >
                <Card className="transition hover:border-gold">
                  <CardContent className="flex items-center justify-between gap-4 p-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="capitalize">
                          {WORKFLOW_LABEL[w.type]}
                        </Badge>
                        <span className="font-medium">{w.client?.full_name ?? "—"}</span>
                        {w.client?.display_id && <span className="font-mono text-[10px] text-muted-foreground">{w.client.display_id}</span>}
                      </div>
                      {w.wig && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          <span className="font-mono mr-1">{w.wig.display_id}</span>
                          {[w.wig.brand, w.wig.style, w.wig.wig_code].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      Updated {format(new Date(w.updated_at), "MMM d")}
                    </div>
                  </CardContent>
                </Card>
              </button>
            ))
          )}
        </TabsContent>
      </Tabs>

      <Sheet open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {active && <WorkflowDetail id={active} onClose={() => setActive(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function NewWorkflowDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [clientId, setClientId] = useState<string | null>(null);
  const [type, setType] = useState<WorkflowType>("sale_cut");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("Select a client");
      const { data: wf, error } = await supabase
        .from("service_workflows")
        .insert({ client_id: clientId, type, notes: notes || null })
        .select()
        .single();
      if (error) throw error;
      const steps = WORKFLOW_STEPS[type].map((s, i) => ({
        workflow_id: wf.id,
        step_order: i,
        step_key: s.key,
        step_label: s.label,
      }));
      const { error: e2 } = await supabase.from("workflow_steps").insert(steps);
      if (e2) throw e2;
      await logAudit({
        action: "create", module: "workflow", recordId: wf.id, recordLabel: type,
        summary: `${type} workflow created`,
        after: wf as unknown as Record<string, unknown>,
      });
      return wf.id;
    },
    onSuccess: (id) => {
      toast.success("Workflow created");
      onCreated(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader><DialogTitle className="font-display text-2xl">New workflow</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div>
          <Label>Client</Label>
          <ClientSelect value={clientId} onChange={setClientId} />
        </div>
        <div>
          <Label>Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as WorkflowType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sale_cut">Sale + Cut</SelectItem>
              <SelectItem value="wash_set">Wash & Set</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>Create</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function WorkflowDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const wf = useQuery({
    queryKey: ["workflow", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_workflows")
        .select("*, client:client_id(full_name), wig:wig_id(brand, style, wig_code)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Workflow & {
        client: { full_name: string } | null;
        wig: { brand: string | null; style: string | null; wig_code: string | null } | null;
      };
    },
  });
  const steps = useQuery({
    queryKey: ["workflow", id, "steps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflow_steps")
        .select("*")
        .eq("workflow_id", id)
        .order("step_order");
      if (error) throw error;
      return data as Step[];
    },
  });

  const toggleStep = useMutation({
    mutationFn: async (step: Step) => {
      const completed = step.status === "completed";
      const { error } = await supabase
        .from("workflow_steps")
        .update({
          status: completed ? "pending" : "completed",
          completed_at: completed ? null : new Date().toISOString(),
          started_at: step.started_at ?? new Date().toISOString(),
        })
        .eq("id", step.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflow", id, "steps"] }),
  });

  const completeWorkflow = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("service_workflows")
        .update({ status: "completed" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Workflow completed");
      qc.invalidateQueries({ queryKey: ["workflows"] });
      qc.invalidateQueries({ queryKey: ["workflow", id] });
      onClose();
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      await supabase.from("workflow_steps").delete().eq("workflow_id", id);
      const { error } = await supabase.from("service_workflows").delete().eq("id", id);
      if (error) throw error;
      await logAudit({ action: "delete", module: "workflow", recordId: id, summary: "Workflow deleted" });
    },
    onSuccess: () => {
      toast.success("Workflow removed");
      qc.invalidateQueries({ queryKey: ["workflows"] });
      onClose();
    },
  });

  if (wf.isLoading || !wf.data) return <Skeleton className="h-64 w-full" />;
  const allDone = (steps.data ?? []).every((s) => s.status === "completed");

  return (
    <div className="space-y-6">
      <SheetHeader>
        <SheetTitle className="font-display text-2xl">
          {WORKFLOW_LABEL[wf.data.type]} · {wf.data.client?.full_name ?? "—"}
        </SheetTitle>
      </SheetHeader>

      <div className="space-y-2">
        {steps.data?.map((s) => (
          <button
            key={s.id}
            onClick={() => toggleStep.mutate(s)}
            className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition hover:border-gold"
          >
            {s.status === "completed" ? (
              <CheckCircle2 className="h-5 w-5 text-gold" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground" />
            )}
            <div className="flex-1">
              <p className={s.status === "completed" ? "font-medium line-through opacity-60" : "font-medium"}>
                {s.step_label}
              </p>
              {s.completed_at && (
                <p className="text-xs text-muted-foreground">
                  {format(new Date(s.completed_at), "MMM d, h:mm a")}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button variant="ghost" size="sm" onClick={() => remove.mutate()} className="text-destructive gap-2">
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
        {wf.data.status === "open" && (
          <Button onClick={() => completeWorkflow.mutate()} disabled={!allDone}>
            Mark workflow complete
          </Button>
        )}
      </div>
    </div>
  );
}
