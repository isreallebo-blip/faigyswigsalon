import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/twilio-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const formData = await request.formData();
        const sid = formData.get("MessageSid")?.toString();
        const status = formData.get("MessageStatus")?.toString() ?? formData.get("SmsStatus")?.toString();
        if (!sid || !status) return new Response("ok");
        const map: Record<string, string> = {
          queued: "queued",
          sent: "sent",
          delivered: "delivered",
          read: "read",
          failed: "failed",
          undelivered: "failed",
        };
        const mapped = map[status] ?? "sent";
        await supabaseAdmin
          .from("messages")
          .update({ delivery_status: mapped as "queued" | "sent" | "delivered" | "read" | "failed" })
          .eq("provider_message_id", sid);
        return new Response("ok");
      },
    },
  },
});
