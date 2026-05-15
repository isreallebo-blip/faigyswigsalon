import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  appendMessage,
  extractConversationIdFromAddress,
  getOrCreateOpenConversation,
  maybeSendAutoReply,
  notifyStaffOfInbound,
} from "@/lib/inbox/send.server";

type ResendInbound = {
  type?: string;
  data?: {
    from?: { email?: string };
    to?: Array<{ email?: string }>;
    subject?: string;
    text?: string;
    html?: string;
    headers?: Record<string, string>;
    message_id?: string;
    in_reply_to?: string;
  };
};

export const Route = createFileRoute("/api/public/resend-inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Resend inbound webhook payload (svix-signed). For now we accept and rely on webhook secret in URL if set.
        const payload = (await request.json()) as ResendInbound;
        const d = payload?.data;
        if (!d) return new Response("ok");

        const fromEmail = d.from?.email?.toLowerCase() ?? "";
        const body = d.text ?? d.html ?? "";
        const subject = d.subject ?? "";
        const providerId = d.message_id ?? null;
        const inReplyTo = d.in_reply_to ?? null;

        // Try to find conversation via the To: address (inbox+<id>@...)
        let conversationId: string | null = null;
        for (const r of d.to ?? []) {
          const cid = extractConversationIdFromAddress(r.email);
          if (cid) {
            conversationId = cid;
            break;
          }
        }

        // Fallback: match by sender email -> client
        const { data: client } = await supabaseAdmin
          .from("clients")
          .select("id, full_name, phone, email")
          .ilike("email", fromEmail)
          .maybeSingle();

        if (!conversationId && client) {
          conversationId = await getOrCreateOpenConversation(client.id as string, body.slice(0, 140), "email");
        }
        if (!conversationId) {
          // Drop into orphan conversation
          const { data: orphan } = await supabaseAdmin
            .from("conversations")
            .insert({
              client_id: null,
              subject: `unmatched:${fromEmail}`,
              status: "unread",
              last_inbound_channel: "email",
              last_message_preview: body.slice(0, 140),
              last_message_at: new Date().toISOString(),
            })
            .select("id")
            .single();
          conversationId = (orphan?.id as string) ?? null;
        }
        if (!conversationId) return new Response("ok");

        await appendMessage({
          conversationId,
          clientId: (client?.id as string) ?? null,
          direction: "inbound",
          channel: "email",
          body,
          subject,
          senderName: (client?.full_name as string) ?? fromEmail,
          providerMessageId: providerId,
          inReplyTo,
          deliveryStatus: "delivered",
        });

        if (client) {
          await notifyStaffOfInbound({
            conversationId,
            clientName: client.full_name as string,
            preview: body.slice(0, 200),
          });
          await maybeSendAutoReply({
            conversationId,
            clientId: client.id as string,
            clientPhone: client.phone as string | null,
            clientEmail: client.email as string | null,
            channel: "email",
            firstName: (client.full_name as string).split(" ")[0],
          });
        }
        return new Response("ok");
      },
    },
  },
});
