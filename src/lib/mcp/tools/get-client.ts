import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthenticated, errorResult, jsonResult } from "../supabase";

export default defineTool({
  name: "get_client",
  title: "Get client overview",
  description:
    "Get a full overview for one client: profile details, their wigs, upcoming appointments, open repairs, and recent payments.",
  inputSchema: {
    client_id: z.string().uuid().describe("The client's UUID (from search_clients)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ client_id }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);

    const { data: client, error } = await supabase
      .from("clients")
      .select(
        "id, display_id, full_name, phone, email, status, preferences, notes, measurements, sms_opt_in, email_opt_in, portal_status, created_at",
      )
      .eq("id", client_id)
      .maybeSingle();
    if (error) return errorResult(error.message);
    if (!client) return errorResult("No client found with that id.");

    const [wigs, appointments, repairs, payments] = await Promise.all([
      supabase.from("wigs").select("id, wig_code, brand, style, color, cap_size, status").eq("client_id", client_id),
      supabase
        .from("appointments")
        .select("id, starts_at, ends_at, type, status, notes")
        .eq("client_id", client_id)
        .gte("starts_at", new Date().toISOString())
        .order("starts_at")
        .limit(10),
      supabase
        .from("repairs")
        .select("id, vendor, status, work_requested, date_sent, expected_return, cost")
        .eq("client_id", client_id)
        .order("date_sent", { ascending: false })
        .limit(10),
      supabase
        .from("payments")
        .select("id, date, amount, method, category, status, description")
        .eq("client_id", client_id)
        .order("date", { ascending: false })
        .limit(10),
    ]);

    return jsonResult({
      client,
      wigs: wigs.data ?? [],
      upcoming_appointments: appointments.data ?? [],
      recent_repairs: repairs.data ?? [],
      recent_payments: payments.data ?? [],
    });
  },
});
