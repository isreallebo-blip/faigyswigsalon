import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type ResendEvent = {
  type?: string;
  data?: { email_id?: string };
};

export const Route = createFileRoute("/api/public/resend-events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const payload = (await request.json()) as ResendEvent;
        const id = payload?.data?.email_id;
        const type = payload?.type ?? "";
        if (!id) return new Response("ok");
        const map: Record<string, "queued" | "sent" | "delivered" | "read" | "failed"> = {
          "email.sent": "sent",
          "email.delivered": "delivered",
          "email.opened": "read",
          "email.bounced": "failed",
          "email.complained": "failed",
        };
        const status = map[type];
        if (!status) return new Response("ok");
        await supabaseAdmin
          .from("messages")
          .update({ delivery_status: status })
          .eq("provider_message_id", id);
        return new Response("ok");
      },
    },
  },
});
