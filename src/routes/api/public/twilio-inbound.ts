import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  appendMessage,
  getOrCreateOpenConversation,
  maybeSendAutoReply,
  notifyStaffOfInbound,
} from "@/lib/inbox/send.server";

function verifyTwilioSignature(authToken: string, url: string, params: Record<string, string>, signature: string): boolean {
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const k of sortedKeys) data += k + params[k];
  const expected = createHmac("sha1", authToken).update(data).digest("base64");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/twilio-inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        if (!authToken) return new Response("Not configured", { status: 500 });

        const formData = await request.formData();
        const params: Record<string, string> = {};
        for (const [k, v] of formData.entries()) params[k] = v.toString();
        const signature = request.headers.get("x-twilio-signature") ?? "";
        const fullUrl = request.url;
        if (!verifyTwilioSignature(authToken, fullUrl, params, signature)) {
          return new Response("Invalid signature", { status: 401 });
        }

        const from = params.From ?? "";
        const body = (params.Body ?? "").trim();
        const messageSid = params.MessageSid ?? null;
        if (!from || !body) return new Response("<Response/>", { headers: { "Content-Type": "application/xml" } });

        // STOP / START handling
        const upper = body.toUpperCase();
        if (["STOP", "STOPALL", "UNSUBSCRIBE", "QUIT", "CANCEL", "END"].includes(upper)) {
          await supabaseAdmin.from("clients").update({ sms_opt_in: false }).eq("phone", from);
          return new Response("<Response/>", { headers: { "Content-Type": "application/xml" } });
        }
        if (["START", "UNSTOP", "YES"].includes(upper)) {
          await supabaseAdmin.from("clients").update({ sms_opt_in: true }).eq("phone", from);
          return new Response("<Response/>", { headers: { "Content-Type": "application/xml" } });
        }

        // Match client by phone
        const { data: client } = await supabaseAdmin
          .from("clients")
          .select("id, full_name, phone, email")
          .eq("phone", from)
          .maybeSingle();

        if (!client) {
          // Unmatched — store with a placeholder conversation we'll create with a NULL client
          // Fallback: create one orphan conversation per unknown number, keyed via metadata
          // Simplest approach: drop into staff inbox by inserting a row with client_id=null on a synthetic conversation.
          // We need a conversation_id (NOT NULL FK). Find or create an "unmatched" conversation marked with the phone in subject.
          const { data: existingOrphan } = await supabaseAdmin
            .from("conversations")
            .select("id")
            .is("client_id", null)
            .eq("subject", `unmatched:${from}`)
            .maybeSingle();
          let convId = existingOrphan?.id as string | undefined;
          if (!convId) {
            const { data: created } = await supabaseAdmin
              .from("conversations")
              .insert({
                client_id: null,
                subject: `unmatched:${from}`,
                status: "unread",
                last_inbound_channel: "sms",
                last_message_preview: body.slice(0, 140),
                last_message_at: new Date().toISOString(),
              })
              .select("id")
              .single();
            convId = created?.id as string | undefined;
          }
          if (convId) {
            await appendMessage({
              conversationId: convId,
              clientId: null,
              direction: "inbound",
              channel: "sms",
              body,
              senderName: from,
              providerMessageId: messageSid,
              deliveryStatus: "delivered",
            });
          }
          return new Response("<Response/>", { headers: { "Content-Type": "application/xml" } });
        }

        const conversationId = await getOrCreateOpenConversation(client.id as string, body.slice(0, 140), "sms");
        await appendMessage({
          conversationId,
          clientId: client.id as string,
          direction: "inbound",
          channel: "sms",
          body,
          senderName: client.full_name as string,
          providerMessageId: messageSid,
          deliveryStatus: "delivered",
        });

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
          channel: "sms",
          firstName: (client.full_name as string).split(" ")[0],
        });

        return new Response("<Response/>", { headers: { "Content-Type": "application/xml" } });
      },
    },
  },
});
