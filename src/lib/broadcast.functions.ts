import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const recipientFilterSchema = z.object({
  all_active: z.boolean().optional(),
  upcoming_week: z.boolean().optional(),
  in_repair: z.boolean().optional(),
  custom_ids: z.array(z.string().uuid()).optional(),
});
export type RecipientFilter = z.infer<typeof recipientFilterSchema>;

type ClientRow = {
  id: string;
  full_name: string;
  display_id: string | null;
  phone: string | null;
  email: string | null;
  sms_opt_in: boolean;
  email_opt_in: boolean;
};

async function collectRecipients(filter: RecipientFilter): Promise<ClientRow[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ids = new Set<string>();

  if (filter.all_active) {
    const { data } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("status", "active");
    (data ?? []).forEach((r) => ids.add(r.id as string));
  }
  if (filter.upcoming_week) {
    const now = new Date();
    const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const { data } = await supabaseAdmin
      .from("appointments")
      .select("client_id")
      .gte("starts_at", now.toISOString())
      .lte("starts_at", weekOut.toISOString())
      .neq("status", "cancelled");
    (data ?? []).forEach((r) => r.client_id && ids.add(r.client_id as string));
  }
  if (filter.in_repair) {
    const { data } = await supabaseAdmin
      .from("repairs")
      .select("client_id")
      .is("actual_return", null);
    (data ?? []).forEach((r) => r.client_id && ids.add(r.client_id as string));
  }
  if (filter.custom_ids) {
    filter.custom_ids.forEach((id) => ids.add(id));
  }

  if (ids.size === 0) return [];

  const { data: clients } = await supabaseAdmin
    .from("clients")
    .select("id, full_name, display_id, phone, email, sms_opt_in, email_opt_in")
    .in("id", Array.from(ids));
  return (clients ?? []) as ClientRow[];
}

export const previewBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(recipientFilterSchema)
  .handler(async ({ data }) => {
    const rows = await collectRecipients(data);
    return {
      total: rows.length,
      with_phone: rows.filter((r) => r.phone && r.sms_opt_in).length,
      with_email: rows.filter((r) => r.email && r.email_opt_in).length,
      sample: rows.slice(0, 1).map((r) => ({
        first_name: r.full_name.split(" ")[0] ?? r.full_name,
        full_name: r.full_name,
        display_id: r.display_id,
      })),
    };
  });

export const searchClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ q: z.string().max(100) }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const q = data.q.trim();
    if (!q) return { rows: [] };
    const { data: rows } = await supabaseAdmin
      .from("clients")
      .select("id, full_name, display_id, phone, email")
      .or(`full_name.ilike.%${q}%,display_id.ilike.%${q}%`)
      .limit(25);
    return { rows: rows ?? [] };
  });

function applyVars(template: string, c: ClientRow): string {
  const first = (c.full_name.split(" ")[0] ?? c.full_name) || "";
  const last = c.full_name.split(" ").slice(1).join(" ");
  return template
    .split("[First Name]").join(first)
    .split("[Last Name]").join(last)
    .split("[CLT ID]").join(c.display_id ?? "")
    .split("[Appointment Date]").join("")
    .split("[Balance]").join("");
}

export const sendBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      filter: recipientFilterSchema,
      channel: z.enum(["sms", "email", "both"]),
      sms_body: z.string().max(1600).optional(),
      email_subject: z.string().max(200).optional(),
      email_body: z.string().max(20000).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Admins only");

    if ((data.channel === "sms" || data.channel === "both") && !data.sms_body?.trim()) {
      throw new Error("SMS body is required");
    }
    if ((data.channel === "email" || data.channel === "both") && (!data.email_subject?.trim() || !data.email_body?.trim())) {
      throw new Error("Email subject and body are required");
    }

    const recipients = await collectRecipients(data.filter);
    if (recipients.length === 0) throw new Error("No recipients matched the selected filters.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendSmsRaw, sendEmailRaw } = await import("@/lib/inbox/send.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();

    const { data: bc, error: bcErr } = await supabaseAdmin
      .from("broadcasts")
      .insert({
        sent_by: context.userId,
        sent_by_name: profile?.full_name ?? null,
        channel: data.channel,
        body: data.sms_body ?? data.email_body ?? "",
        email_subject: data.email_subject ?? null,
        recipient_filter: data.filter as unknown as never,
        recipient_count: recipients.length,
        sent_count: 0,
        delivered_count: 0,
        failed_count: 0,
      })
      .select("id")
      .single();
    if (bcErr || !bc) throw new Error(bcErr?.message ?? "Could not create broadcast");

    let sent = 0;
    let failed = 0;

    for (const c of recipients) {
      if (data.channel === "sms" || data.channel === "both") {
        if (c.phone && c.sms_opt_in && data.sms_body) {
          const body = applyVars(data.sms_body, c);
          const result = await sendSmsRaw(c.phone, body);
          await supabaseAdmin.from("broadcast_recipients").insert({
            broadcast_id: bc.id,
            client_id: c.id,
            client_name: c.full_name,
            channel: "sms",
            recipient: c.phone,
            status: result.error ? "failed" : "sent",
            error_message: result.error ?? null,
            provider_message_id: result.id ?? null,
          });
          if (result.error) failed++;
          else sent++;
        } else {
          await supabaseAdmin.from("broadcast_recipients").insert({
            broadcast_id: bc.id,
            client_id: c.id,
            client_name: c.full_name,
            channel: "sms",
            recipient: c.phone,
            status: "failed",
            error_message: !c.phone ? "No phone on file" : "SMS opt-out",
          });
          failed++;
        }
      }
      if (data.channel === "email" || data.channel === "both") {
        if (c.email && c.email_opt_in && data.email_body && data.email_subject) {
          const subject = applyVars(data.email_subject, c);
          const bodyText = applyVars(data.email_body, c);
          const html = `<!doctype html><html><body style="margin:0;background:#faf6ef;font-family:Georgia,serif;color:#2a2218;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf6ef;padding:32px 0;"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e8dcc4;border-radius:6px;">
<tr><td style="background:#bfa15a;color:#fff;padding:20px;text-align:center;font-size:20px;letter-spacing:1px;">Faigy's Wig Salon</td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.6;white-space:pre-wrap;">${bodyText.replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[m]!)}</td></tr>
</table></td></tr></table></body></html>`;
          const result = await sendEmailRaw({ to: c.email, subject, html });
          await supabaseAdmin.from("broadcast_recipients").insert({
            broadcast_id: bc.id,
            client_id: c.id,
            client_name: c.full_name,
            channel: "email",
            recipient: c.email,
            status: result.error ? "failed" : "sent",
            error_message: result.error ?? null,
            provider_message_id: result.id ?? null,
          });
          if (result.error) failed++;
          else sent++;
        } else {
          await supabaseAdmin.from("broadcast_recipients").insert({
            broadcast_id: bc.id,
            client_id: c.id,
            client_name: c.full_name,
            channel: "email",
            recipient: c.email,
            status: "failed",
            error_message: !c.email ? "No email on file" : "Email opt-out",
          });
          failed++;
        }
      }
    }

    await supabaseAdmin
      .from("broadcasts")
      .update({ sent_count: sent, failed_count: failed })
      .eq("id", bc.id);

    return { ok: true, broadcast_id: bc.id, sent, failed, total: recipients.length };
  });

export const listBroadcasts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("broadcasts")
      .select("id, created_at, sent_by_name, channel, body, email_subject, recipient_count, sent_count, failed_count")
      .order("created_at", { ascending: false })
      .limit(50);
    return { rows: data ?? [] };
  });
