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

type Addr = string | { email?: string; address?: string; name?: string };
type ResendInbound = {
  type?: string;
  data?: {
    from?: Addr | Addr[];
    to?: Addr | Addr[];
    subject?: string;
    text?: string;
    html?: string;
    headers?: Record<string, string> | Array<{ name: string; value: string }>;
    message_id?: string;
    messageId?: string;
    in_reply_to?: string;
    inReplyTo?: string;
  };
};

function addrEmail(a: Addr | undefined | null): string {
  if (!a) return "";
  if (typeof a === "string") {
    // "Name <foo@bar.com>" or "foo@bar.com"
    const m = a.match(/<([^>]+)>/);
    return (m ? m[1] : a).trim().toLowerCase();
  }
  return (a.email ?? a.address ?? "").trim().toLowerCase();
}
function addrList(a: Addr | Addr[] | undefined): string[] {
  if (!a) return [];
  return (Array.isArray(a) ? a : [a]).map(addrEmail).filter(Boolean);
}

function htmlToPlain(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}



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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const root = payload as any;
        const d = root?.data ?? root;
        if (!d) return new Response("ok");
        // Resend inbound may nest the email under data.email or send extra body fields
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const e: any = d.email ?? d;

        const fromEmail = addrList(e.from)[0] ?? addrList(d.from)[0] ?? "";
        const toEmails = addrList(e.to).length ? addrList(e.to) : addrList(d.to);
        const textBody =
          e.text ?? e.text_body ?? e.textBody ?? e.plain ?? e.body_plain ?? e.bodyPlain ?? null;
        const htmlBody =
          e.html ?? e.html_body ?? e.htmlBody ?? e.body_html ?? e.bodyHtml ?? null;
        const body: string = textBody ?? htmlToPlain(htmlBody ?? "") ?? "";
        const subject = e.subject ?? d.subject ?? "";
        const providerId = e.message_id ?? e.messageId ?? d.message_id ?? d.messageId ?? null;
        const inReplyTo = e.in_reply_to ?? e.inReplyTo ?? d.in_reply_to ?? d.inReplyTo ?? null;

        if (!body) {
          console.warn(
            "[resend-inbound] empty body — payload top-level keys:",
            Object.keys(root ?? {}),
            "data keys:",
            Object.keys(d ?? {}),
            "email keys:",
            e === d ? "(none)" : Object.keys(e ?? {}),
          );
        }


        // Try to find conversation via the To: address (inbox+<id>@...)
        let conversationId: string | null = null;
        for (const email of toEmails) {
          const cid = extractConversationIdFromAddress(email);
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
