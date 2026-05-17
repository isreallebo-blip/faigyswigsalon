// Server-only helpers for sending and receiving inbox messages.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const INBOUND_DOMAIN = "notify.faigyswigsalon.com";

export function replyToForConversation(conversationId: string): string {
  return `inbox+${conversationId}@${INBOUND_DOMAIN}`;
}

export function extractConversationIdFromAddress(addr: string | null | undefined): string | null {
  if (!addr) return null;
  const m = addr.match(/inbox\+([0-9a-f-]{36})@/i);
  return m ? m[1] : null;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function plainEmailHtml(text: string, conversationId: string): string {
  const html = escapeHtml(text).replace(/\n/g, "<br/>");
  return `<!doctype html><html><body style="margin:0;background:#faf6ef;font-family:Georgia,serif;color:#2a2218;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf6ef;padding:32px 0;"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e8dcc4;border-radius:6px;">
<tr><td style="background:#bfa15a;color:#fff;padding:20px;text-align:center;font-size:20px;letter-spacing:1px;">Faigy's Wig Salon</td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.6;">${html}</td></tr>
<tr><td style="padding:0 24px 18px;font-size:11px;color:#a08c63;">Reply to this email and we'll see your message in our inbox.</td></tr>
</table></td></tr></table>
<div style="display:none">conv:${conversationId}</div>
</body></html>`;
}

export async function sendSmsRaw(to: string, body: string): Promise<{ id?: string; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return { error: "Twilio not configured" };
  try {
    const auth = btoa(`${sid}:${token}`);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    const json = (await res.json()) as { sid?: string; message?: string };
    if (!res.ok) return { error: json.message ?? `Twilio ${res.status}` };
    return { id: json.sid };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

const SITE_NAME = "Faigy's Wig Salon";
const SENDER_DOMAIN = "notify.faigyswigsalon.com";
const FROM_DOMAIN = "faigyswigsalon.com";
const FROM_ADDRESS = `${SITE_NAME} <noreply@${FROM_DOMAIN}>`;

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Enqueue an outbound email through the Lovable Emails queue
 * (process-email-queue dispatcher). Returns the message_id on success
 * so it can be stored on the conversation message for tracking.
 */
export async function sendEmailRaw(opts: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string;
}): Promise<{ id?: string; error?: string }> {
  try {
    const messageId = crypto.randomUUID();

    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: "inbox_reply",
      recipient_email: opts.to,
      status: "pending",
    });

    const { error } = await supabaseAdmin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to: opts.to,
        from: FROM_ADDRESS,
        sender_domain: SENDER_DOMAIN,
        subject: opts.subject,
        html: opts.html,
        text: htmlToText(opts.html),
        purpose: "transactional",
        reply_to: opts.replyTo,
        label: "inbox_reply",
        queued_at: new Date().toISOString(),
      },
    });

    if (error) {
      await supabaseAdmin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "inbox_reply",
        recipient_email: opts.to,
        status: "failed",
        error_message: error.message,
      });
      return { error: error.message };
    }

    return { id: messageId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Find or create the open (non-resolved) conversation for a client. */
export async function getOrCreateOpenConversation(
  clientId: string,
  preview?: string,
  channel?: "sms" | "email" | "portal",
): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("client_id", clientId)
    .neq("status", "resolved")
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data: created, error } = await supabaseAdmin
    .from("conversations")
    .insert({
      client_id: clientId,
      status: "unread",
      last_message_preview: preview ?? null,
      last_inbound_channel: channel ?? null,
      last_message_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? "Could not create conversation");
  return created.id as string;
}

export async function appendMessage(opts: {
  conversationId: string;
  clientId: string | null;
  direction: "inbound" | "outbound";
  channel: "sms" | "email" | "portal" | "internal_note";
  body: string;
  subject?: string | null;
  senderUserId?: string | null;
  senderName?: string | null;
  providerMessageId?: string | null;
  inReplyTo?: string | null;
  deliveryStatus?: "queued" | "sent" | "delivered" | "read" | "failed";
  deliveryError?: string | null;
}) {
  const preview = opts.body.slice(0, 140);
  const inserted = await supabaseAdmin
    .from("messages")
    .insert({
      conversation_id: opts.conversationId,
      client_id: opts.clientId,
      direction: opts.direction,
      channel: opts.channel,
      body: opts.body,
      subject: opts.subject ?? null,
      sender_user_id: opts.senderUserId ?? null,
      sender_name: opts.senderName ?? null,
      provider_message_id: opts.providerMessageId ?? null,
      in_reply_to: opts.inReplyTo ?? null,
      delivery_status: opts.deliveryStatus ?? (opts.direction === "inbound" ? "delivered" : "sent"),
      delivery_error: opts.deliveryError ?? null,
    })
    .select("id")
    .single();

  if (opts.channel !== "internal_note") {
    if (opts.direction === "inbound") {
      await supabaseAdmin
        .from("conversations")
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: preview,
          status: "unread",
          last_inbound_channel: opts.channel,
        })
        .eq("id", opts.conversationId);
    } else {
      await supabaseAdmin
        .from("conversations")
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: preview,
          status: "replied",
        })
        .eq("id", opts.conversationId);
    }
  }

  return inserted.data?.id as string | undefined;
}

/** Notify all admins when a new inbound message arrives. */
export async function notifyStaffOfInbound(opts: {
  conversationId: string;
  clientName: string;
  preview: string;
}) {
  const { data: admins } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, profiles:user_id(email, full_name)")
    .eq("role", "admin");
  if (!admins) return;
  const subject = `New message from ${opts.clientName}`;
  const html = plainEmailHtml(
    `${opts.clientName} just sent a new message:\n\n"${opts.preview}"\n\nOpen the inbox to reply.`,
    opts.conversationId,
  );
  for (const row of admins) {
    const profile = (row as unknown as { profiles?: { email?: string | null } }).profiles;
    const email = profile?.email;
    if (!email) continue;
    await sendEmailRaw({ to: email, subject, html });
  }
}

/** Business-hours auto-reply (returns true if one was sent). */
export async function maybeSendAutoReply(opts: {
  conversationId: string;
  clientId: string;
  clientPhone: string | null;
  clientEmail: string | null;
  channel: "sms" | "email";
  firstName: string;
}): Promise<boolean> {
  const { data: settings } = await supabaseAdmin
    .from("messaging_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (!settings || !settings.auto_reply_enabled) return false;

  // 24h dedupe
  const { data: conv } = await supabaseAdmin
    .from("conversations")
    .select("auto_reply_sent_at")
    .eq("id", opts.conversationId)
    .maybeSingle();
  if (conv?.auto_reply_sent_at) {
    const last = new Date(conv.auto_reply_sent_at as string);
    if (Date.now() - last.getTime() < 24 * 60 * 60 * 1000) return false;
  }

  // Business hours check (Asia/Jerusalem default)
  if (isWithinBusinessHours(settings.business_hours as BusinessHours, settings.timezone as string)) {
    return false;
  }

  const body = (settings.auto_reply_body as string).split("[First Name]").join(opts.firstName);

  if (opts.channel === "sms" && opts.clientPhone) {
    const r = await sendSmsRaw(opts.clientPhone, `${body}\n\nReply STOP to unsubscribe`);
    await appendMessage({
      conversationId: opts.conversationId,
      clientId: opts.clientId,
      direction: "outbound",
      channel: "sms",
      body,
      senderName: "Auto-reply",
      providerMessageId: r.id ?? null,
      deliveryStatus: r.error ? "failed" : "sent",
      deliveryError: r.error ?? null,
    });
  } else if (opts.channel === "email" && opts.clientEmail) {
    const r = await sendEmailRaw({
      to: opts.clientEmail,
      subject: "Faigy's Wig Salon — we got your message",
      html: plainEmailHtml(body, opts.conversationId),
      replyTo: replyToForConversation(opts.conversationId),
    });
    await appendMessage({
      conversationId: opts.conversationId,
      clientId: opts.clientId,
      direction: "outbound",
      channel: "email",
      body,
      subject: "Faigy's Wig Salon — we got your message",
      senderName: "Auto-reply",
      providerMessageId: r.id ?? null,
      deliveryStatus: r.error ? "failed" : "sent",
      deliveryError: r.error ?? null,
    });
  } else {
    return false;
  }

  await supabaseAdmin
    .from("conversations")
    .update({ auto_reply_sent_at: new Date().toISOString() })
    .eq("id", opts.conversationId);
  return true;
}

type BusinessHours = Record<string, { open: string; close: string; enabled: boolean }>;

function isWithinBusinessHours(bh: BusinessHours, tz: string): boolean {
  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const wd = parts.find((p) => p.type === "weekday")?.value.toLowerCase().slice(0, 3) ?? "";
    const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
    const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
    const cur = `${hour}:${minute}`;
    const slot = bh[wd];
    if (!slot || !slot.enabled) return false;
    return cur >= slot.open && cur <= slot.close;
  } catch {
    return true; // fail open — don't auto-reply if we can't tell
  }
}

export { plainEmailHtml };
