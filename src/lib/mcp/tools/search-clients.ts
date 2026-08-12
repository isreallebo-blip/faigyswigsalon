import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthenticated, errorResult, jsonResult } from "../supabase";

export default defineTool({
  name: "search_clients",
  title: "Search clients",
  description:
    "Search salon clients by name, phone, email, or client ID. Returns matching client records with contact info and status.",
  inputSchema: {
    query: z.string().trim().min(1).describe("Name, phone, email, or client display ID to search for."),
    limit: z.number().int().min(1).max(50).optional().describe("Max results to return (default 10)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const term = query.replace(/[%,]/g, " ").trim();
    const { data, error } = await supabase
      .from("clients")
      .select("id, display_id, full_name, phone, email, status, portal_status, created_at")
      .or(
        `full_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%,display_id.ilike.%${term}%`,
      )
      .order("full_name")
      .limit(limit ?? 10);
    if (error) return errorResult(error.message);
    return jsonResult({ count: data?.length ?? 0, clients: data ?? [] });
  },
});
