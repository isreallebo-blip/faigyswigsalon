// Server-only notification sending. Twilio (SMS) + Resend (email).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { HDate } from "@hebcal/core";
import { getOrCreateOpenConversation, replyToForConversation, appendMessage } from "@/lib/inbox/send.server";

export type NotifVars = {
  firstName?: string;
  lastName?: string;
  date?: string;
  day?: string;
  time?: string;
  amount?: string;
  hebrewDate?: string;
  cltId?: string;
  appointmentType?: string;
  appointmentDate?: string;
  newDate?: string;
  newDay?: string;
  newTime?: string;
  portalLink?: string;
  resetLink?: string;
};

function applyVars(template: string, v: NotifVars): string {
  const map: Record<string, string> = {
    "[First Name]": v.firstName ?? "",
    "[Last Name]": v.lastName ?? "",
    "[Date]": v.date ?? "",
    "[Day]": v.day ?? "",
    "[Time]": v.time ?? "",
    "[Amount]": v.amount ?? "",
    "[Hebrew Date]": v.hebrewDate ?? "",
    "[CLT ID]": v.cltId ?? "",
    "[Appointment Type]": v.appointmentType ?? "",
    "[Appointment Date]": v.appointmentDate ?? "",
    "[New Date]": v.newDate ?? v.date ?? "",
    "[New Day]": v.newDay ?? v.day ?? "",
    "[New Time]": v.newTime ?? v.time ?? "",
    "[Portal Link]": v.portalLink ?? "",
    "[Reset Link]": v.resetLink ?? "",
  };
  let out = template;
  for (const [k, val] of Object.entries(map)) {
    out = out.split(k).join(val);
  }
  return out;
}

export function formatHebrewDate(d: Date): string {
  try {
    return new HDate(d).renderGematriya();
  } catch {
    return "";
  }
}

export function formatDateParts(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const day = d.toLocaleDateString("en-US", { weekday: "long" });
  const date = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return { day, date, time, hebrewDate: formatHebrewDate(d) };
}

async function sendSms(to: string, body: string): Promise<{ id?: string; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return { error: "Twilio not configured" };
  try {
    const auth = btoa(`${sid}:${token}`);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: `${body}\n\nReply STOP to unsubscribe` }),
    });
    const json = await res.json() as { sid?: string; message?: string };
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

async function getOrCreateUnsubscribeToken(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const { data: existing } = await supabaseAdmin
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", normalized)
    .maybeSingle();
  if (existing?.token) return existing.token;

  const token = crypto.randomUUID();
  const { error } = await supabaseAdmin
    .from("email_unsubscribe_tokens")
    .upsert({ email: normalized, token }, { onConflict: "email" });
  if (error) throw error;

  const { data: created } = await supabaseAdmin
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", normalized)
    .single();
  return created.token;
}

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

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  replyTo?: string,
  label?: string,
): Promise<{ id?: string; error?: string }> {
  try {
    const messageId = crypto.randomUUID();
    const unsubscribeToken = await getOrCreateUnsubscribeToken(to);
    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: label ?? "notification",
      recipient_email: to,
      status: "pending",
    });
    const { error } = await supabaseAdmin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        idempotency_key: messageId,
        to,
        from: FROM_ADDRESS,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text: htmlToText(html),
        purpose: "transactional",
        reply_to: replyTo,
        label: label ?? "notification",
        unsubscribe_token: unsubscribeToken,
        queued_at: new Date().toISOString(),
      },
    });
    if (error) {
      await supabaseAdmin.from("email_send_log").insert({
        message_id: messageId,
        template_name: label ?? "notification",
        recipient_email: to,
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

function renderReceipt(opts: {
  clientName: string; cltId: string; date: string; hebrewDate: string;
  amount: string; method: string; description: string; balance?: string;
}): string {
  const balRow = opts.balance
    ? `<tr><td style="padding:8px 0;color:#6b5e4a;">Balance</td><td style="text-align:right;font-weight:600;">${opts.balance}</td></tr>`
    : `<tr><td colspan="2" style="padding:12px 0;color:#7a6442;font-style:italic;">Paid in full</td></tr>`;
  return `<!doctype html><html><body style="margin:0;background:#faf6ef;font-family:Georgia,serif;color:#2a2218;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf6ef;padding:32px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e8dcc4;border-radius:6px;overflow:hidden;">
<tr><td style="background:#bfa15a;color:#fff;padding:24px;text-align:center;">
<h1 style="margin:0;font-size:24px;letter-spacing:1px;">Faigy's Wig Salon</h1>
<div style="margin-top:6px;font-size:13px;opacity:.9;">Receipt</div>
</td></tr>
<tr><td style="padding:24px;">
<div style="font-size:15px;margin-bottom:4px;">${opts.clientName}</div>
<div style="font-size:12px;color:#8b7a5b;margin-bottom:20px;">${opts.cltId}</div>
<table width="100%" style="font-size:14px;border-top:1px solid #efe6d2;">
<tr><td style="padding:10px 0;color:#6b5e4a;">Date</td><td style="text-align:right;">${opts.date}</td></tr>
${opts.hebrewDate ? `<tr><td style="padding:8px 0;color:#6b5e4a;">Hebrew Date</td><td style="text-align:right;">${opts.hebrewDate}</td></tr>` : ""}
<tr><td style="padding:8px 0;color:#6b5e4a;">Description</td><td style="text-align:right;">${opts.description || "Payment"}</td></tr>
<tr><td style="padding:8px 0;color:#6b5e4a;">Method</td><td style="text-align:right;">${opts.method}</td></tr>
<tr><td style="padding:8px 0;color:#6b5e4a;">Amount</td><td style="text-align:right;font-weight:700;font-size:18px;">${opts.amount}</td></tr>
${balRow}
</table>
<p style="margin:24px 0 0;text-align:center;color:#7a6442;font-style:italic;">Thank you for your business.</p>
</td></tr>
<tr><td style="background:#f6efe1;padding:14px;text-align:center;font-size:11px;color:#8b7a5b;">Faigy's Wig Salon</td></tr>
</table></td></tr></table></body></html>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function plainEmailHtml(text: string): string {
  const html = escapeHtml(text).replace(/\n/g, "<br/>");
  return `<!doctype html><html><body style="margin:0;background:#faf6ef;font-family:Georgia,serif;color:#2a2218;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf6ef;padding:32px 0;">
<tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e8dcc4;border-radius:6px;">
<tr><td style="background:#bfa15a;color:#fff;padding:20px;text-align:center;font-size:20px;letter-spacing:1px;">Faigy's Wig Salon</td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.6;">${html}</td></tr>
</table></td></tr></table></body></html>`;
}

export async function sendNotification(opts: {
  clientId: string;
  templateKey: string;
  vars?: NotifVars;
  idempotencyKey?: string;
  receiptData?: Parameters<typeof renderReceipt>[0];
}): Promise<{ ok: boolean; results: Array<{ channel: string; status: string; error?: string }> }> {
  const { clientId, templateKey, vars = {}, idempotencyKey, receiptData } = opts;

  // Idempotency check
  if (idempotencyKey) {
    const { data: existing } = await supabaseAdmin
      .from("notification_log")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) return { ok: true, results: [{ channel: "skipped", status: "duplicate" }] };
  }

  const { data: tpl } = await supabaseAdmin
    .from("notification_templates")
    .select("*")
    .eq("key", templateKey)
    .maybeSingle();
  if (!tpl || !tpl.enabled) return { ok: true, results: [{ channel: "skipped", status: "disabled" }] };

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("full_name, email, phone, sms_opt_in, email_opt_in, display_id")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) return { ok: false, results: [{ channel: "skipped", status: "no_client" }] };

  const filledVars: NotifVars = {
    ...vars,
    firstName: vars.firstName ?? (client.full_name?.split(" ")[0] ?? ""),
    lastName: vars.lastName ?? (client.full_name?.split(" ").slice(1).join(" ") ?? ""),
    cltId: vars.cltId ?? (client.display_id ?? ""),
  };

  const results: Array<{ channel: string; status: string; error?: string }> = [];

  const hasPhone = !!client.phone;
  const hasEmail = !!client.email;
  // Channel decision: template-enabled AND client opted-in AND has contact.
  // Fallback rule: if only one method on file, use it (other channel skipped naturally).
  const wantSms = tpl.send_sms && client.sms_opt_in && hasPhone;
  const wantEmail = tpl.send_email && client.email_opt_in && hasEmail;

  if (wantSms) {
    const body = applyVars(tpl.sms_body, filledVars);
    const r = await sendSms(client.phone!, body);
    results.push({ channel: "sms", status: r.error ? "failed" : "sent", error: r.error });
    await supabaseAdmin.from("notification_log").insert({
      client_id: clientId, template_key: templateKey, channel: "sms",
      recipient: client.phone, body, status: r.error ? "failed" : "sent",
      error_message: r.error ?? null, provider_message_id: r.id ?? null,
      idempotency_key: idempotencyKey ? `${idempotencyKey}:sms` : null,
    });
  }

  if (wantEmail) {
    const subject = applyVars(tpl.email_subject, filledVars) || "Faigy's Wig Salon";
    let html: string;
    if (tpl.email_body === "__RECEIPT__" && receiptData) {
      html = renderReceipt(receiptData);
    } else {
      html = plainEmailHtml(applyVars(tpl.email_body, filledVars));
    }
    // Wire Reply-To so client replies thread back into the inbox.
    let replyTo: string | undefined;
    let conversationId: string | undefined;
    try {
      conversationId = await getOrCreateOpenConversation(clientId, subject, "email");
      replyTo = replyToForConversation(conversationId);
    } catch {
      // If conversation creation fails, still send the email without Reply-To.
    }
    const r = await sendEmail(client.email!, subject, html, replyTo, templateKey);
    results.push({ channel: "email", status: r.error ? "failed" : "queued", error: r.error });
    await supabaseAdmin.from("notification_log").insert({
      client_id: clientId, template_key: templateKey, channel: "email",
      recipient: client.email, subject, body: html, status: r.error ? "failed" : "queued",
      error_message: r.error ?? null, provider_message_id: r.id ?? null,
      idempotency_key: idempotencyKey ? `${idempotencyKey}:email` : null,
    });
    // Mirror into messages so the outbound notification shows up in the thread.
    if (conversationId && !r.error) {
      try {
        await appendMessage({
          conversationId,
          clientId,
          direction: "outbound",
          channel: "email",
          body: applyVars(tpl.email_body, filledVars),
          subject,
          senderName: "System",
          providerMessageId: r.id ?? null,
          deliveryStatus: "sent",
        });
      } catch {
        // best-effort
      }
    }
  }

  return { ok: true, results };
}
