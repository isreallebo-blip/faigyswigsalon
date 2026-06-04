// Server-only helpers for the verification system. Do not import from client.
import { createHash, randomBytes } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const CODE_TTL_MIN = 10;
export const VERIFIED_TTL_MIN = 15;
export const LOCKOUT_MIN = 30;
export const MAX_ATTEMPTS = 3;

export function generateCode(): string {
  // 6-digit numeric, leading-zero safe
  const n = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return n.toString().padStart(6, "0");
}

export function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function maskEmail(email: string): string {
  const [u, d] = email.split("@");
  if (!u || !d) return email;
  const head = u.slice(0, 1);
  return `${head}${"*".repeat(Math.max(1, u.length - 1))}@${d}`;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return phone;
  const last4 = digits.slice(-4);
  return `(***) ***-${last4}`;
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

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<{ id?: string; error?: string }> {
  try {
    const { sendEmailRaw } = await import("@/lib/inbox/send.server");
    return await sendEmailRaw({ to, subject, html });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}


export function codeEmailHtml(code: string): string {
  return `<!doctype html><html><body style="margin:0;background:#faf6ef;font-family:Georgia,serif;color:#2a2218;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;"><tr><td align="center">
  <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e8dcc4;border-radius:6px;">
  <tr><td style="background:#bfa15a;color:#fff;padding:18px;text-align:center;font-size:18px;letter-spacing:1px;">Faigy's Wig Salon</td></tr>
  <tr><td style="padding:28px;text-align:center;">
    <p style="margin:0 0 8px;color:#6b5e4a;">Your verification code is</p>
    <p style="margin:0;font-size:34px;letter-spacing:8px;font-weight:700;color:#2a2218;">${code}</p>
    <p style="margin:14px 0 0;font-size:13px;color:#8b7a5b;">Expires in ${CODE_TTL_MIN} minutes. If you didn't request this, you can ignore this email.</p>
  </td></tr></table></td></tr></table></body></html>`;
}

export function alertEmailHtml(when: Date): string {
  return `<!doctype html><html><body style="margin:0;background:#faf6ef;font-family:Georgia,serif;color:#2a2218;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;"><tr><td align="center">
  <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e8dcc4;border-radius:6px;">
  <tr><td style="background:#a23a3a;color:#fff;padding:18px;text-align:center;font-size:18px;letter-spacing:1px;">Security alert</td></tr>
  <tr><td style="padding:24px;font-size:15px;line-height:1.6;">
    <p>Someone made multiple failed verification attempts on your Faigy's Wig Salon account at <strong>${when.toLocaleString()}</strong>.</p>
    <p>Your account is locked for ${LOCKOUT_MIN} minutes. If this wasn't you, please contact us right away.</p>
  </td></tr></table></td></tr></table></body></html>`;
}

export function actionConfirmHtml(action: string): string {
  return `<!doctype html><html><body style="margin:0;background:#faf6ef;font-family:Georgia,serif;color:#2a2218;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;"><tr><td align="center">
  <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e8dcc4;border-radius:6px;">
  <tr><td style="background:#bfa15a;color:#fff;padding:18px;text-align:center;font-size:18px;letter-spacing:1px;">Faigy's Wig Salon</td></tr>
  <tr><td style="padding:24px;font-size:15px;line-height:1.6;">
    <p>Your <strong>${action}</strong> was successfully changed on ${new Date().toLocaleString()}.</p>
    <p>If you did not make this change please contact us immediately.</p>
  </td></tr></table></td></tr></table></body></html>`;
}

export async function sendCodeVia(
  channel: "email" | "sms",
  destination: string,
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  if (channel === "email") {
    const r = await sendEmail(destination, "Your verification code", codeEmailHtml(code));
    return { ok: !r.error, error: r.error };
  }
  const r = await sendSms(destination, `Faigy's Wig Salon verification code: ${code} (expires in ${CODE_TTL_MIN} min)`);
  return { ok: !r.error, error: r.error };
}

export async function sendSmsRaw(to: string, body: string) {
  return sendSms(to, body);
}

export async function auditVerify(opts: {
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  ip: string | null;
  summary: string;
  details?: Record<string, unknown>;
  action?: "create" | "update" | "view";
}) {
  try {
    await supabaseAdmin.from("audit_logs").insert({
      user_id: opts.userId,
      user_email: opts.userEmail,
      user_name: opts.userName,
      ip_address: opts.ip,
      action: opts.action ?? "view",
      module: "security",
      record_id: null,
      record_label: null,
      summary: opts.summary,
      after: (opts.details ?? null) as never,
    });
  } catch {
    /* swallow */
  }
}
