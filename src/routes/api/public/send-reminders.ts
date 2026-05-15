import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Public endpoint hit by an external cron (e.g. cron-job.org) every ~15 min.
// Optional auth: if CRON_SECRET is set, requests must include
// `Authorization: Bearer <secret>`. Otherwise it's open (cron-only URL).
//
// For each upcoming appointment whose 24h or 2h reminder window has just
// arrived, this marks the reminder timestamp and logs an activity row.
// Hooking into Twilio (or any other SMS provider) is a follow-up: read
// `client.phone` and POST to the provider inside the loop.

type ReminderWindow = "24h" | "2h";

const WINDOWS: Array<{
  key: ReminderWindow;
  column: "reminder_24h_sent_at" | "reminder_2h_sent_at";
  fromHrs: number;
  toHrs: number;
}> = [
  { key: "24h", column: "reminder_24h_sent_at", fromHrs: 23.75, toHrs: 24.25 },
  { key: "2h", column: "reminder_2h_sent_at", fromHrs: 1.75, toHrs: 2.25 },
];

export const Route = createFileRoute("/api/public/send-reminders")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const now = Date.now();
  const results: Array<{ window: ReminderWindow; processed: number }> = [];

  for (const w of WINDOWS) {
    const from = new Date(now + w.fromHrs * 3600_000).toISOString();
    const to = new Date(now + w.toHrs * 3600_000).toISOString();

    const { data: appts, error } = await supabaseAdmin
      .from("appointments")
      .select("id, client_id, type, starts_at, " + w.column + ", clients:client_id(full_name, phone)")
      .gte("starts_at", from)
      .lte("starts_at", to)
      .in("status", ["scheduled", "confirmed"])
      .is(w.column, null);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    let processed = 0;
    for (const a of appts ?? []) {
      // TODO: send actual SMS via Twilio (or chosen provider) using
      // (a as any).clients?.phone. Requires TWILIO_* env secrets.
      const stamp = new Date().toISOString();
      const { error: updErr } = await supabaseAdmin
        .from("appointments")
        .update({ [w.column]: stamp })
        .eq("id", a.id);
      if (updErr) continue;

      await supabaseAdmin.from("activity_log").insert({
        type: "reminder_sent",
        summary: `${w.key} reminder marked for appointment`,
        ref_id: a.id,
        ref_table: "appointments",
        client_id: (a as { client_id: string | null }).client_id,
        data: { window: w.key },
      });
      processed += 1;
    }
    results.push({ window: w.key, processed });
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
