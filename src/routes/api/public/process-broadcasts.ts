import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendSmsRaw, sendEmailRaw, plainEmailHtml } from "@/lib/inbox/send.server";

const BATCH_SIZE = 25;

function applyVars(template: string, c: { full_name: string; display_id: string }): string {
  const [first, ...rest] = (c.full_name ?? "").split(" ");
  const map: Record<string, string> = {
    "[First Name]": first ?? "",
    "[Last Name]": rest.join(" "),
    "[CLT ID]": c.display_id ?? "",
    "[Appointment Date]": "",
    "[Balance]": "",
  };
  let out = template;
  for (const [k, v] of Object.entries(map)) out = out.split(k).join(v);
  return out;
}

export const Route = createFileRoute("/api/public/process-broadcasts")({
  server: {
    handlers: {
      GET: async () => handle(),
      POST: async () => handle(),
    },
  },
});

async function handle() {
  const { data: queued } = await supabaseAdmin
    .from("broadcast_recipients")
    .select(
      "id, broadcast_id, client_id, client_name, channel, recipient, broadcasts:broadcast_id(body, email_subject, status)",
    )
    .eq("status", "queued")
    .limit(BATCH_SIZE);

  if (!queued || queued.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      headers: { "content-type": "application/json" },
    });
  }

  let processed = 0;
  const touchedBroadcasts = new Set<string>();

  for (const r of queued) {
    const bcast = (r as unknown as {
      broadcasts?: { body: string; email_subject: string | null; status: string };
    }).broadcasts;
    if (!bcast || !r.recipient) continue;

    touchedBroadcasts.add(r.broadcast_id as string);

    const client = { full_name: r.client_name ?? "", display_id: "" };
    const body = applyVars(bcast.body, client);

    let providerId: string | null = null;
    let error: string | null = null;

    if (r.channel === "sms") {
      const res = await sendSmsRaw(r.recipient, `${body}\n\nReply STOP to unsubscribe`);
      providerId = res.id ?? null;
      error = res.error ?? null;
    } else {
      const subject = bcast.email_subject ?? "Faigy's Wig Salon";
      const res = await sendEmailRaw({
        to: r.recipient,
        subject,
        html: plainEmailHtml(body, r.broadcast_id as string),
      });
      providerId = res.id ?? null;
      error = res.error ?? null;
    }

    await supabaseAdmin
      .from("broadcast_recipients")
      .update({
        status: error ? "failed" : "sent",
        error_message: error,
        provider_message_id: providerId,
      })
      .eq("id", r.id);

    processed += 1;
  }

  // Refresh aggregates on touched broadcasts
  for (const bid of touchedBroadcasts) {
    const { data: agg } = await supabaseAdmin
      .from("broadcast_recipients")
      .select("status")
      .eq("broadcast_id", bid);
    const rows = agg ?? [];
    const sent = rows.filter((x) => x.status === "sent" || x.status === "delivered").length;
    const failed = rows.filter((x) => x.status === "failed").length;
    const stillQueued = rows.some((x) => x.status === "queued");
    await supabaseAdmin
      .from("broadcasts")
      .update({
        sent_count: sent,
        failed_count: failed,
        delivered_count: sent,
        status: stillQueued ? "sending" : "completed",
        sent_at: stillQueued ? null : new Date().toISOString(),
      })
      .eq("id", bid);
  }

  return new Response(JSON.stringify({ ok: true, processed }), {
    headers: { "content-type": "application/json" },
  });
}
