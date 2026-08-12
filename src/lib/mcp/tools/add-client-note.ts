import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthenticated, errorResult, jsonResult } from "../supabase";

export default defineTool({
  name: "add_client_note",
  title: "Add client note",
  description:
    "Append a timestamped note to a client's notes field. Existing notes are preserved; nothing is overwritten.",
  inputSchema: {
    client_id: z.string().uuid().describe("The client's UUID (from search_clients)."),
    note: z.string().trim().min(1).max(2000).describe("The note text to append."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ client_id, note }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);

    const { data: client, error: readError } = await supabase
      .from("clients")
      .select("id, full_name, notes")
      .eq("id", client_id)
      .maybeSingle();
    if (readError) return errorResult(readError.message);
    if (!client) return errorResult("No client found with that id.");

    const stamp = new Date().toISOString().slice(0, 10);
    const line = `[${stamp}] ${note}`;
    const next = client.notes?.trim() ? `${client.notes.trim()}\n${line}` : line;

    const { error } = await supabase.from("clients").update({ notes: next }).eq("id", client_id);
    if (error) return errorResult(error.message);

    return jsonResult({ ok: true, client_id, client_name: client.full_name, appended: line });
  },
});
