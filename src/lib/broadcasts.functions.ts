import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function ensureAdmin(userId: string) {
  const { data } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Admins only");
}

const RecipientFilter = z.object({
  allActive: z.boolean().optional(),
  upcomingThisWeek: z.boolean().optional(),
  outstandingBalance: z.boolean().optional(),
  inRepair: z.boolean().optional(),
  customClientIds: z.array(z.string().uuid()).optional(),
});
export type RecipientFilter = z.infer<typeof RecipientFilter>;

type ClientRow = {
  id: string;
  full_name: string;
  display_id: string;
  phone: string | null;
  email: string | null;
  sms_opt_in: boolean;
  email_opt_in: boolean;
  status: string;
};

async function resolveRecipients(filter: RecipientFilter): Promise<ClientRow[]> {
  const ids = new Set<string>();
  const pushFrom = async (q: PromiseLike<{ data: { id: string }[] | null }>) => {
    const { data } = await q;
    (data ?? []).forEach((r) => ids.add(r.id));
  };

  if (filter.allActive) {
    await pushFrom(
      supabaseAdmin.from("clients").select("id").eq("status", "active") as unknown as PromiseLike<{
        data: { id: string }[] | null;
      }>,
    );
  }
  if (filter.upcomingThisWeek) {
    const now = new Date();
    const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const { data: appts } = await supabaseAdmin
      .from("appointments")
      .select("client_id")
      .gte("starts_at", now.toISOString())
      .lte("starts_at", weekAhead.toISOString())
      .in("status", ["scheduled", "confirmed"]);
    (appts ?? []).forEach((a) => a.client_id && ids.add(a.client_id as string));
  }
  if (filter.outstandingBalance) {
    const { data: pays } = await supabaseAdmin
      .from("payments")
      .select("client_id, amount, status")
      .neq("status", "paid");
    (pays ?? []).forEach((p) => p.client_id && ids.add(p.client_id as string));
  }
  if (filter.inRepair) {
    const { data: reps } = await supabaseAdmin
      .from("repairs")
      .select("client_id, status")
      .in("status", ["pending", "in_progress", "sent"]);
    (reps ?? []).forEach((r) => r.client_id && ids.add(r.client_id as string));
  }
  (filter.customClientIds ?? []).forEach((id) => ids.add(id));

  if (ids.size === 0) return [];
  const { data: clients } = await supabaseAdmin
    .from("clients")
    .select("id, full_name, display_id, phone, email, sms_opt_in, email_opt_in, status")
    .in("id", Array.from(ids));
  return (clients ?? []) as ClientRow[];
}

function summarizeFilter(f: RecipientFilter): string {
  const parts: string[] = [];
  if (f.allActive) parts.push("All active clients");
  if (f.upcomingThisWeek) parts.push("Upcoming this week");
  if (f.outstandingBalance) parts.push("Outstanding balance");
  if (f.inRepair) parts.push("Wig in repair");
  if (f.customClientIds?.length) parts.push(`${f.customClientIds.length} hand-picked`);
  return parts.join(" + ") || "No filter";
}

export const previewBroadcastRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ filter: RecipientFilter, channel: z.enum(["sms", "email", "both"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const clients = await resolveRecipients(data.filter);
    const reachable = clients.filter((c) => {
      if (data.channel === "sms") return !!c.phone && c.sms_opt_in;
      if (data.channel === "email") return !!c.email && c.email_opt_in;
      return (!!c.phone && c.sms_opt_in) || (!!c.email && c.email_opt_in);
    });
    const optedOut = clients.filter((c) => data.channel !== "email" && !c.sms_opt_in).length;
    const sample = reachable.slice(0, 5).map((c) => ({
      id: c.id,
      name: c.full_name,
      display_id: c.display_id,
    }));
    return {
      total: clients.length,
      reachable: reachable.length,
      optedOut,
      sample,
      summary: summarizeFilter(data.filter),
    };
  });

export const searchClientsForBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const term = `%${data.q}%`;
    const { data: clients } = await supabaseAdmin
      .from("clients")
      .select("id, full_name, display_id, phone, email, sms_opt_in")
      .or(`full_name.ilike.${term},display_id.ilike.${term}`)
      .limit(20);
    return clients ?? [];
  });

export const createBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        filter: RecipientFilter,
        channel: z.enum(["sms", "email", "both"]),
        body: z.string().trim().min(1).max(1600),
        email_subject: z.string().trim().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    if ((data.channel === "email" || data.channel === "both") && !data.email_subject) {
      throw new Error("Email subject is required");
    }
    const clients = await resolveRecipients(data.filter);

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    const senderName = profile?.full_name ?? profile?.email ?? "Admin";

    const { data: broadcast, error: bErr } = await supabaseAdmin
      .from("broadcasts")
      .insert({
        sent_by: context.userId,
        sent_by_name: senderName,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        channel: data.channel as any,
        body: data.body,
        email_subject: data.email_subject ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recipient_filter: data.filter as any,
        recipient_filter_summary: summarizeFilter(data.filter),
        recipient_count: 0,
        status: "queued",
      })
      .select("id")
      .single();
    if (bErr || !broadcast) throw new Error(bErr?.message ?? "Could not create broadcast");

    const rows: Array<{
      broadcast_id: string;
      client_id: string;
      client_name: string;
      channel: "sms" | "email";
      recipient: string | null;
      status: "queued" | "failed";
      error_message: string | null;
    }> = [];

    const channels: Array<"sms" | "email"> =
      data.channel === "both" ? ["sms", "email"] : [data.channel as "sms" | "email"];

    for (const c of clients) {
      for (const ch of channels) {
        const optedIn = ch === "sms" ? c.sms_opt_in : c.email_opt_in;
        const recipient = ch === "sms" ? c.phone : c.email;
        if (!optedIn) {
          rows.push({
            broadcast_id: broadcast.id,
            client_id: c.id,
            client_name: c.full_name,
            channel: ch,
            recipient,
            status: "failed",
            error_message: ch === "sms" ? "Opted out (STOP)" : "Email opt-out",
          });
        } else if (!recipient) {
          rows.push({
            broadcast_id: broadcast.id,
            client_id: c.id,
            client_name: c.full_name,
            channel: ch,
            recipient: null,
            status: "failed",
            error_message: ch === "sms" ? "No phone number" : "No email address",
          });
        } else {
          rows.push({
            broadcast_id: broadcast.id,
            client_id: c.id,
            client_name: c.full_name,
            channel: ch,
            recipient,
            status: "queued",
            error_message: null,
          });
        }
      }
    }

    if (rows.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabaseAdmin.from("broadcast_recipients").insert(rows as any);
      if (error) throw new Error(error.message);
    }

    const queued = rows.filter((r) => r.status === "queued").length;
    const failed = rows.filter((r) => r.status === "failed").length;
    await supabaseAdmin
      .from("broadcasts")
      .update({
        recipient_count: rows.length,
        failed_count: failed,
        status: queued === 0 ? "completed" : "queued",
        sent_at: queued === 0 ? new Date().toISOString() : null,
      })
      .eq("id", broadcast.id);

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      actor_email: profile?.email ?? null,
      action: "broadcast.created",
      target_type: "broadcast",
      target_id: broadcast.id,
      summary: `Broadcast to ${rows.length} recipient(s) via ${data.channel}`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metadata: {
        recipient_count: rows.length,
        channel: data.channel,
        body_preview: data.body.slice(0, 200),
        filter_summary: summarizeFilter(data.filter),
      } as any,
    });

    return { broadcastId: broadcast.id, total: rows.length, queued, failed };
  });

export const listBroadcasts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data } = await supabaseAdmin
      .from("broadcasts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });

export const getBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: broadcast } = await supabaseAdmin
      .from("broadcasts")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!broadcast) throw new Error("Broadcast not found");
    const { data: recipients } = await supabaseAdmin
      .from("broadcast_recipients")
      .select("*")
      .eq("broadcast_id", data.id)
      .order("created_at", { ascending: true });
    return { broadcast, recipients: recipients ?? [] };
  });

export const retryFailedBroadcastRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const { data: failed } = await supabaseAdmin
      .from("broadcast_recipients")
      .select("id, client_id, recipient, error_message")
      .eq("broadcast_id", data.id)
      .eq("status", "failed");
    // Only re-queue rows that have a recipient AND weren't opted-out / missing data.
    const eligible = (failed ?? []).filter(
      (r) =>
        !!r.recipient &&
        !(r.error_message ?? "").toLowerCase().includes("opt") &&
        !(r.error_message ?? "").toLowerCase().includes("no "),
    );
    if (eligible.length) {
      await supabaseAdmin
        .from("broadcast_recipients")
        .update({ status: "queued", error_message: null })
        .in(
          "id",
          eligible.map((r) => r.id),
        );
      await supabaseAdmin
        .from("broadcasts")
        .update({ status: "queued", sent_at: null })
        .eq("id", data.id);
    }
    return { requeued: eligible.length };
  });
