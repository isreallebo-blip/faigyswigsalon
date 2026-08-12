import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthenticated, errorResult, jsonResult } from "../supabase";

export default defineTool({
  name: "list_payments",
  title: "List payments",
  description:
    "List salon payments in a date range with totals by method, optionally filtered by client, method, or status.",
  inputSchema: {
    from: z.string().optional().describe("Start date (YYYY-MM-DD). Defaults to 30 days ago."),
    to: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
    client_id: z.string().uuid().optional().describe("Only payments for this client."),
    method: z
      .enum(["cash", "check", "credit_card", "zelle", "other"])
      .optional()
      .describe("Filter by payment method."),
    limit: z.number().int().min(1).max(200).optional().describe("Max results (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, client_id, method, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);

    const today = new Date();
    const start = from ?? new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const end = to ?? today.toISOString().slice(0, 10);

    let query = supabase
      .from("payments")
      .select("id, date, amount, method, category, status, description, refunded_amount_cents, clients(id, full_name)")
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: false })
      .limit(limit ?? 50);
    if (client_id) query = query.eq("client_id", client_id);
    if (method) query = query.eq("method", method);

    const { data, error } = await query;
    if (error) return errorResult(error.message);

    const rows = data ?? [];
    const totals: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      if (row.status === "voided") continue;
      const net = Number(row.amount) - Number(row.refunded_amount_cents ?? 0) / 100;
      totals[row.method] = (totals[row.method] ?? 0) + net;
      total += net;
    }

    return jsonResult({
      from: start,
      to: end,
      count: rows.length,
      net_total: Math.round(total * 100) / 100,
      net_totals_by_method: totals,
      payments: rows,
    });
  },
});
