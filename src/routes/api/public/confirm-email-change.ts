import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function html(body: string, ok = true): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"/><title>Email confirmation</title>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <style>body{font-family:Georgia,serif;background:#faf6ef;margin:0;padding:48px;color:#2a2218;}
    .card{max-width:480px;margin:0 auto;background:#fff;border:1px solid #e8dcc4;border-radius:8px;padding:32px;text-align:center;}
    h1{color:${ok ? "#bfa15a" : "#a23a3a"};margin:0 0 12px;}
    a{color:#bfa15a;}</style></head><body><div class="card">${body}</div></body></html>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/public/confirm-email-change")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token") ?? "";
        if (!token || token.length > 128 || !/^[a-f0-9]+$/i.test(token)) {
          return html("<h1>Invalid link</h1><p>This link is invalid.</p>", false);
        }
        const { data: pending } = await supabaseAdmin
          .from("pending_email_changes")
          .select("*")
          .eq("confirm_token", token)
          .maybeSingle();
        if (!pending) return html("<h1>Link expired</h1><p>This confirmation link is no longer valid.</p>", false);
        if (pending.confirmed_at) return html("<h1>Already confirmed</h1><p>Your new email is already active.</p>");
        if (new Date(pending.expires_at).getTime() < Date.now())
          return html("<h1>Link expired</h1><p>Please request a new email change.</p>", false);

        // Apply
        if (pending.subject_type === "staff") {
          const { error } = await supabaseAdmin.auth.admin.updateUserById(pending.user_id, {
            email: pending.new_email,
          });
          if (error) return html(`<h1>Could not update</h1><p>${error.message}</p>`, false);
          await supabaseAdmin.from("profiles").update({ email: pending.new_email }).eq("id", pending.user_id);
        } else {
          await supabaseAdmin.from("clients").update({ email: pending.new_email }).eq("id", pending.user_id);
        }
        await supabaseAdmin
          .from("pending_email_changes")
          .update({ confirmed_at: new Date().toISOString() })
          .eq("id", pending.id);

        return html(
          `<h1>Email confirmed</h1><p>Your email is now <strong>${pending.new_email}</strong>.</p><p><a href="/">Return to Faigy's Wig Salon</a></p>`,
        );
      },
    },
  },
});
