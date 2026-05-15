import { supabase } from "@/integrations/supabase/client";
import { getClientIp } from "@/lib/audit.functions";

export type AuditAction = "create" | "update" | "delete" | "view" | "void";
export type AuditModule =
  | "client"
  | "inventory"
  | "appointment"
  | "repair"
  | "payment"
  | "vendor"
  | "user_management"
  | "settings"
  | "workflow"
  | "custom_order"
  | "bank_account"
  | "bank_transaction";

interface LogArgs {
  action: AuditAction;
  module: AuditModule;
  recordId?: string | null;
  recordLabel?: string | null;
  summary: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

let cachedIp: string | null | undefined;
async function resolveIp() {
  if (cachedIp !== undefined) return cachedIp;
  try {
    const res = await getClientIp();
    cachedIp = res?.ip ?? null;
  } catch {
    cachedIp = null;
  }
  return cachedIp;
}

function diff(before?: Record<string, unknown> | null, after?: Record<string, unknown> | null) {
  if (!before || !after) return null;
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (k === "updated_at" || k === "created_at") continue;
    const a = before[k];
    const b = after[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) changes[k] = { from: a ?? null, to: b ?? null };
  }
  return Object.keys(changes).length ? changes : null;
}

export async function logAudit(args: LogArgs) {
  try {
    const { data: sess } = await supabase.auth.getUser();
    const user = sess.user;
    let userName: string | null = null;
    if (user) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .maybeSingle();
      userName = prof?.full_name ?? user.email ?? null;
    }
    const ip = await resolveIp();
    await supabase.from("audit_logs").insert({
      user_id: user?.id ?? null,
      user_email: user?.email ?? null,
      user_name: userName,
      ip_address: ip,
      action: args.action,
      module: args.module,
      record_id: args.recordId ?? null,
      record_label: args.recordLabel ?? null,
      summary: args.summary,
      before: args.before ?? null,
      after: args.after ?? null,
      changes: diff(args.before, args.after),
    });
  } catch (e) {
    // Audit logging must never break the user flow.
    console.error("Audit log failed", e);
  }
}
