import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Map internal wig status -> client-friendly label
function clientWigStatus(status: string | null | undefined): string {
  switch (status) {
    case "in_repair":
    case "sent_repair":
    case "sent_for_repair":
      return "At the repair shop";
    case "returned":
    case "ready":
    case "ready_pickup":
      return "Ready for pickup";
    case "available":
    case "reserved":
      return "At the salon";
    case "sold":
      return "Completed purchase";
    default:
      return "At the salon";
  }
}

function clientRepairStatus(status: string | null | undefined): string {
  switch (status) {
    case "sent_to_vendor":
    case "in_progress":
      return "In Progress";
    case "returned":
    case "ready":
      return "Ready for Pickup";
    case "completed":
      return "Completed";
    default:
      return "In Progress";
  }
}

async function logPortalActivity(opts: {
  userId: string;
  userEmail: string | null;
  action: string;
  summary: string;
  recordId?: string | null;
}) {
  try {
    await supabaseAdmin.from("audit_logs").insert({
      user_id: opts.userId,
      user_email: opts.userEmail,
      user_name: opts.userEmail,
      action: opts.action as "view" | "update" | "create",
      module: "portal",
      record_id: opts.recordId ?? null,
      summary: opts.summary,
    });
  } catch {
    /* swallow */
  }
}

async function resolveClientId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  return data?.id ?? null;
}

export const getPortalMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, claims } = context;
    const { data } = await supabaseAdmin
      .from("clients")
      .select("id, display_id, full_name, email, phone, photo_url, self_registered, sms_opt_in, email_opt_in")
      .eq("auth_user_id", userId)
      .maybeSingle();
    return {
      client: data,
      userEmail: (claims.email as string) ?? null,
    };
  });

export const getPortalUnreadCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientId = await resolveClientId(context.userId);
    if (!clientId) return { count: 0 };
    const { count } = await supabaseAdmin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("direction", "outbound")
      .neq("channel", "internal_note")
      .is("read_by_client_at", null);
    return { count: count ?? 0 };
  });

export const getPortalDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientId = await resolveClientId(context.userId);
    if (!clientId) return null;

    const nowIso = new Date().toISOString();
    const [nextAppt, repairsInProgress, payments, totalVisits] = await Promise.all([
      supabaseAdmin
        .from("appointments")
        .select("id, type, starts_at, status")
        .eq("client_id", clientId)
        .gte("starts_at", nowIso)
        .neq("status", "cancelled")
        .order("starts_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("repairs")
        .select("id, status, expected_return")
        .eq("client_id", clientId)
        .in("status", ["in_progress", "sent_to_vendor", "issue"]),
      supabaseAdmin
        .from("payments")
        .select("amount, voided_at")
        .eq("client_id", clientId),
      supabaseAdmin
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("status", "completed"),
    ]);

    let outstanding = 0;
    void outstanding;
    let totalPaid = 0;
    for (const p of payments.data ?? []) {
      if (p.voided_at) continue;
      totalPaid += Number(p.amount ?? 0);
    }

    void logPortalActivity({
      userId: context.userId,
      userEmail: (context.claims.email as string) ?? null,
      action: "view",
      summary: "Client viewed dashboard",
      recordId: clientId,
    });

    return {
      nextAppointment: nextAppt.data,
      repairsInProgressCount: (repairsInProgress.data ?? []).length,
      outstandingBalance: Math.max(outstanding, 0),
      totalVisits: totalVisits.count ?? 0,
    };
  });

export const getPortalAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientId = await resolveClientId(context.userId);
    if (!clientId) return [];
    const { data } = await supabaseAdmin
      .from("appointments")
      .select("id, type, starts_at, ends_at, status, notes")
      .eq("client_id", clientId)
      .order("starts_at", { ascending: false });
    void logPortalActivity({
      userId: context.userId,
      userEmail: (context.claims.email as string) ?? null,
      action: "view",
      summary: "Client viewed appointments",
    });
    return data ?? [];
  });

export const getPortalWigs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientId = await resolveClientId(context.userId);
    if (!clientId) return [];

    // Collect wig IDs tied to this client
    const [wfs, reps, reserved] = await Promise.all([
      supabaseAdmin.from("service_workflows").select("wig_id").eq("client_id", clientId),
      supabaseAdmin.from("repairs").select("wig_id").eq("client_id", clientId),
      supabaseAdmin.from("wigs").select("id, display_id, style, color, hair_type, status, photos")
        .eq("reserved_for_client_id", clientId),
    ]);

    const ids = new Set<string>();
    for (const r of wfs.data ?? []) if (r.wig_id) ids.add(r.wig_id);
    for (const r of reps.data ?? []) if (r.wig_id) ids.add(r.wig_id);
    const reservedRows = reserved.data ?? [];

    let extra: typeof reservedRows = [];
    const remaining = [...ids].filter((id) => !reservedRows.find((r) => r.id === id));
    if (remaining.length) {
      const { data } = await supabaseAdmin
        .from("wigs")
        .select("id, display_id, style, color, hair_type, status, photos")
        .in("id", remaining);
      extra = data ?? [];
    }

    const all = [...reservedRows, ...extra];
    return all.map((w) => ({
      id: w.id,
      display_id: w.display_id,
      style: w.style,
      color: w.color,
      hair_type: w.hair_type,
      photo: (w.photos ?? [])[0] ?? null,
      client_status: clientWigStatus(w.status),
    }));
  });

export const getPortalRepairs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientId = await resolveClientId(context.userId);
    if (!clientId) return [];
    const { data } = await supabaseAdmin
      .from("repairs")
      .select("id, wig_id, status, work_requested, date_sent, expected_return, actual_return")
      .eq("client_id", clientId)
      .order("date_sent", { ascending: false });

    const wigIds = [...new Set((data ?? []).map((r) => r.wig_id).filter(Boolean) as string[])];
    let wigsMap = new Map<string, { display_id: string; style: string | null }>();
    if (wigIds.length) {
      const { data: wigs } = await supabaseAdmin
        .from("wigs")
        .select("id, display_id, style")
        .in("id", wigIds);
      wigsMap = new Map((wigs ?? []).map((w) => [w.id, { display_id: w.display_id, style: w.style }]));
    }

    return (data ?? []).map((r) => ({
      id: r.id,
      wig: r.wig_id ? wigsMap.get(r.wig_id) ?? null : null,
      vendor_label: "our repair partner",
      work_requested: r.work_requested,
      date_sent: r.date_sent,
      expected_return: r.expected_return,
      actual_return: r.actual_return,
      client_status: clientRepairStatus(r.status),
    }));
  });

export const getPortalPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientId = await resolveClientId(context.userId);
    if (!clientId) return { rows: [], totalSpent: 0, outstanding: 0 };
    const { data } = await supabaseAdmin
      .from("payments")
      .select("id, date, description, amount, method, category, voided_at")
      .eq("client_id", clientId)
      .order("date", { ascending: false });

    let totalSpent = 0;
    for (const p of data ?? []) {
      if (p.voided_at) continue;
      totalSpent += Number(p.amount ?? 0);
    }
    const outstanding = 0;
    void logPortalActivity({
      userId: context.userId,
      userEmail: (context.claims.email as string) ?? null,
      action: "view",
      summary: "Client viewed payments",
    });
    return {
      rows: (data ?? []).map((p) => ({
        ...p,
        status: p.voided_at ? "Voided" : "Paid",
      })),
      totalSpent,
      outstanding: Math.max(outstanding, 0),
    };
  });

const updateProfileSchema = z.object({
  full_name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.union([z.string().trim().email().max(255), z.literal("")]).optional(),
  photo_url: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const updatePortalProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateProfileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const clientId = await resolveClientId(context.userId);
    if (!clientId) throw new Error("No portal client linked");
    const { error } = await supabaseAdmin
      .from("clients")
      .update({
        full_name: data.full_name,
        phone: data.phone || null,
        email: data.email || null,
        photo_url: data.photo_url || null,
      })
      .eq("id", clientId);
    if (error) throw error;
    void logPortalActivity({
      userId: context.userId,
      userEmail: (context.claims.email as string) ?? null,
      action: "update",
      summary: "Client updated their profile",
      recordId: clientId,
    });
    return { ok: true };
  });

// Staff: count + acknowledge of self-registered clients
export const getSelfRegisteredCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { count } = await supabaseAdmin
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("self_registered", true)
      .eq("self_registered_acknowledged", false);
    return { count: count ?? 0 };
  });

export const acknowledgeSelfRegistrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { error } = await supabaseAdmin
      .from("clients")
      .update({ self_registered_acknowledged: true })
      .eq("self_registered", true)
      .eq("self_registered_acknowledged", false);
    if (error) throw error;
    return { ok: true };
  });
