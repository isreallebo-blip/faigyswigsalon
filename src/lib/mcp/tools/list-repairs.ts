import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthenticated, errorResult, jsonResult } from "../supabase";

export default defineTool({
  name: "list_repairs",
  title: "List repairs",
  description:
    "List wig repairs sent to vendors, newest first. Filter by status to find open jobs or overdue returns.",
  inputSchema: {
    status: z.string().trim().optional().describe("Filter by repair status (e.g. 'sent', 'in_progress', 'returned')."),
    vendor: z.string().trim().optional().describe("Filter by vendor name (partial match)."),
    limit: z.number().int().min(1).max(100).optional().describe("Max results (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, vendor, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);

    let query = supabase
      .from("repairs")
      .select(
        "id, vendor, status, work_requested, date_sent, expected_return, actual_return, cost, notes, clients(id, full_name)",
      )
      .order("date_sent", { ascending: false })
      .limit(limit ?? 25);
    if (status) query = query.eq("status", status as never);
    if (vendor) query = query.ilike("vendor", `%${vendor.replace(/[%,]/g, " ")}%`);

    const { data, error } = await query;
    if (error) return errorResult(error.message);
    return jsonResult({ count: data?.length ?? 0, repairs: data ?? [] });
  },
});
