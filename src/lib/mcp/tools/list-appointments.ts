import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthenticated, errorResult, jsonResult } from "../supabase";

export default defineTool({
  name: "list_appointments",
  title: "List appointments",
  description:
    "List salon appointments in a date range, optionally filtered by status. Includes the client name for each appointment.",
  inputSchema: {
    from: z.string().optional().describe("Start date/time ISO string. Defaults to now."),
    to: z.string().optional().describe("End date/time ISO string. Defaults to 14 days after `from`."),
    status: z
      .enum(["scheduled", "completed", "cancelled", "no_show"])
      .optional()
      .describe("Filter by appointment status."),
    limit: z.number().int().min(1).max(100).optional().describe("Max results (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);

    const start = from ? new Date(from) : new Date();
    if (Number.isNaN(start.getTime())) return errorResult("Invalid `from` date.");
    const end = to ? new Date(to) : new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(end.getTime())) return errorResult("Invalid `to` date.");

    let query = supabase
      .from("appointments")
      .select("id, starts_at, ends_at, type, status, notes, clients(id, full_name, phone)")
      .gte("starts_at", start.toISOString())
      .lte("starts_at", end.toISOString())
      .order("starts_at")
      .limit(limit ?? 50);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return errorResult(error.message);
    return jsonResult({
      from: start.toISOString(),
      to: end.toISOString(),
      count: data?.length ?? 0,
      appointments: data ?? [],
    });
  },
});
