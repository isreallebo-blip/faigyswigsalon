import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
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

/**
 * Verify a Svix-signed webhook (Resend Inbound uses Svix).
 * Signature header: "v1,<base64sig> v1,<base64sig> ..."
 * Signed payload:   "${svix_id}.${svix_timestamp}.${rawBody}"
 * Secret format:    "whsec_<base64-encoded-secret>"
 */
function verifySvixSignature(
  rawBody: string,
  headers: Headers,
  secret: string,
): boolean {
  const id = headers.get("svix-id") ?? headers.get("webhook-id");
  const ts = headers.get("svix-timestamp") ?? headers.get("webhook-timestamp");
  const sigHeader =
    headers.get("svix-signature") ?? headers.get("webhook-signature");
  if (!id || !ts || !sigHeader) return false;

  // Reject if timestamp older than 5 minutes (replay protection)
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  const ageSec = Math.abs(Date.now() / 1000 - tsNum);
  if (ageSec > 300) return false;

  const secretB64 = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let key: Buffer;
  try {
    key = Buffer.from(secretB64, "base64");
  } catch {
    return false;
  }

  const signed = `${id}.${ts}.${rawBody}`;
  const expected = createHmac("sha256", key).update(signed).digest("base64");

  // Header can have multiple space-separated "v1,<sig>" entries
  for (const part of sigHeader.split(" ")) {
    const [, sig] = part.split(",");
    if (!sig) continue;
    try {
      const a = Buffer.from(sig, "base64");
      const b = Buffer.from(expected, "base64");
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch {
      // ignore malformed entry
    }
  }
  return false;
}

export const Route = createFileRoute("/api/public/resend-inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();

        const secret = process.env.RESEND_INBOUND_SECRET;
        if (!secret) {
          console.error("[resend-inbound] RESEND_INBOUND_SECRET not configured");
          return new Response("Server not configured", { status: 500 });
        }
        if (!verifySvixSignature(rawBody, request.headers, secret)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: ResendInbound;
        try {
          payload = JSON.parse(rawBody) as ResendInbound;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

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
