import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function ensureAdmin(userId: string) {
  const { data } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Admins only");
}

const TIMEOUT_MS = 10_000;

function withTimeout<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Check timed out — service may be slow or unreachable")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export type HealthStatus = "healthy" | "error" | "warning";
export type HealthResult = { status: HealthStatus; message: string; detail?: string };

async function checkTwilio(): Promise<HealthResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid) return { status: "error", message: "TWILIO_ACCOUNT_SID is missing" };
  if (!token) return { status: "error", message: "TWILIO_AUTH_TOKEN is missing" };
  if (!from) return { status: "error", message: "TWILIO_FROM_NUMBER is missing" };
  const auth = "Basic " + btoa(`${sid}:${token}`);
  const acctRes = await withTimeout(fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, { headers: { Authorization: auth } }));
  const acct = await acctRes.json().catch(() => ({} as { status?: string; message?: string }));
  if (!acctRes.ok) {
    if (acctRes.status === 401) return { status: "error", message: "Invalid credentials — check your Account SID and Auth Token" };
    return { status: "error", message: `Twilio account check failed (${acctRes.status})`, detail: acct.message };
  }
  if (acct.status !== "active") return { status: "error", message: `Account status is "${acct.status}" — not active` };
  const numRes = await withTimeout(fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(from)}`, { headers: { Authorization: auth } }));
  const num = await numRes.json().catch(() => ({} as { incoming_phone_numbers?: unknown[] }));
  const owned = Array.isArray(num.incoming_phone_numbers) && num.incoming_phone_numbers.length > 0;
  if (!owned) return { status: "error", message: `Phone number ${from} not found on this account` };
  return { status: "healthy", message: `Connected — Account active, number ${from} verified` };
}

async function checkEmailSystem(): Promise<HealthResult> {
  const totalRes = (await withTimeout(
    supabaseAdmin
      .from("email_send_log")
      .select("*", { count: "exact", head: true })
      .eq("status", "sent") as unknown as Promise<{ error: { message: string } | null; count: number | null }>,
  ));
  if (totalRes.error) {
    return { status: "error", message: "Failed — Cannot reach email_send_log", detail: totalRes.error.message };
  }
  const lastRes = (await withTimeout(
    supabaseAdmin
      .from("email_send_log")
      .select("created_at")
      .eq("status", "sent")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle() as unknown as Promise<{ data: { created_at: string } | null; error: { message: string } | null }>,
  ));
  if (lastRes.error) {
    return { status: "error", message: "Failed — Cannot reach email_send_log", detail: lastRes.error.message };
  }
  const lastSent = lastRes.data?.created_at
    ? new Date(lastRes.data.created_at).toLocaleString()
    : "never";
  return {
    status: "healthy",
    message: "Connected — Lovable email system active. Sending from noreply@faigyswigsalon.com",
    detail: `Total sent: ${totalRes.count ?? 0} · Last sent: ${lastSent}`,
  };
}

async function checkDb(): Promise<HealthResult> {
  const { error, count } = await withTimeout(
    supabaseAdmin.from("clients").select("*", { count: "exact", head: true }) as unknown as Promise<{ error: { message: string } | null; count: number | null }>,
  );
  if (error) return { status: "error", message: "Failed — Cannot reach database", detail: error.message };
  return { status: "healthy", message: `Connected — Database responding (${count ?? 0} clients)` };
}

async function checkAuth(): Promise<HealthResult> {
  const { error } = await withTimeout(supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 }));
  if (error) return { status: "error", message: "Failed — Auth service unreachable", detail: error.message };
  return { status: "healthy", message: "Connected — Auth service active" };
}

async function checkStorage(): Promise<HealthResult> {
  const { data, error } = await withTimeout(supabaseAdmin.storage.listBuckets());
  if (error) return { status: "error", message: "Failed — Cannot reach storage", detail: error.message };
  const names = new Set((data ?? []).map((b) => b.name));
  const required = ["client-photos", "wig-photos"];
  const missing = required.filter((n) => !names.has(n));
  if (missing.length) return { status: "error", message: `Failed — Storage bucket missing: ${missing.join(", ")}` };
  return { status: "healthy", message: "Connected — Storage buckets client-photos and wig-photos found" };
}

const REQUIRED_ENV = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
  "RESEND_INBOUND_SECRET",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_APP_URL",
] as const;

function checkEnv(): HealthResult {
  const missing: string[] = [];
  for (const name of REQUIRED_ENV) {
    // Accept VITE_SUPABASE_ANON_KEY OR VITE_SUPABASE_PUBLISHABLE_KEY (template uses publishable)
    if (name === "VITE_SUPABASE_ANON_KEY") {
      const v = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
      if (!v || !v.trim()) missing.push(name);
      continue;
    }
    const v = process.env[name];
    if (!v || !v.trim() || /^(your[_-]|placeholder|changeme|xxxx)/i.test(v)) missing.push(name);
  }
  if (missing.length === 0) return { status: "healthy", message: `All ${REQUIRED_ENV.length} required variables are set` };
  return { status: "warning", message: `Missing variables: ${missing.join(", ")}` };
}

async function safe(name: string, p: Promise<HealthResult>): Promise<HealthResult> {
  try { return await p; }
  catch (e) { return { status: "error", message: `Failed — ${e instanceof Error ? e.message : String(e)}`, detail: name }; }
}

export const runHealthChecks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const [twilio, resend, db, auth, storage] = await Promise.all([
      safe("twilio", checkTwilio()),
      safe("email", checkEmailSystem()),
      safe("db", checkDb()),
      safe("auth", checkAuth()),
      safe("storage", checkStorage()),
    ]);
    const env = checkEnv();
    return {
      checkedAt: new Date().toISOString(),
      checks: { twilio, resend, db, auth, storage, env },
    };
  });

export const sendTestSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      to: z.string().trim().regex(/^\+\d{8,16}$/, "Phone must be in E.164 format (e.g. +15551234567)"),
      body: z.string().trim().min(1).max(1000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!sid || !token || !from) return { ok: false as const, error: "Twilio is not configured" };
    const auth = "Basic " + btoa(`${sid}:${token}`);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: data.to, From: from, Body: data.body }),
    });
    const json = await res.json().catch(() => ({} as { sid?: string; message?: string }));
    if (!res.ok) return { ok: false as const, error: json.message ?? `Twilio ${res.status}` };
    return { ok: true as const, sid: json.sid ?? null };
  });

export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ to: z.string().trim().email() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const messageId = crypto.randomUUID();
    const subject = "Test email from Faigy's Wig Salon";
    const html = `<!doctype html><html><body style="margin:0;background:#faf6ef;font-family:Georgia,serif;color:#2a2218;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf6ef;padding:32px 0;">
<tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e8dcc4;border-radius:6px;">
<tr><td style="background:#bfa15a;color:#fff;padding:20px;text-align:center;font-size:20px;letter-spacing:1px;">Faigy's Wig Salon</td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.6;">
Hi,<br/><br/>This is a test email from Faigy's Wig Salon CRM. If you received this, your email integration is working correctly.<br/><br/>Sent from: noreply@faigyswigsalon.com<br/><br/>— Faigy's Wig Salon
</td></tr></table></td></tr></table></body></html>`;
    const text = `Hi,\n\nThis is a test email from Faigy's Wig Salon CRM. If you received this, your email integration is working correctly.\n\nSent from: noreply@faigyswigsalon.com\n\n— Faigy's Wig Salon`;

    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: "system_health_test",
      recipient_email: data.to,
      status: "pending",
    });

    const { error } = await supabaseAdmin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        idempotency_key: messageId,
        to: data.to,
        from: "Faigy's Wig Salon <noreply@faigyswigsalon.com>",
        sender_domain: "notify.faigyswigsalon.com",
        subject,
        html,
        text,
        purpose: "transactional",
        label: "system_health_test",
        queued_at: new Date().toISOString(),
      },
    });

    if (error) {
      await supabaseAdmin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "system_health_test",
        recipient_email: data.to,
        status: "failed",
        error_message: error.message,
      });
      return { ok: false as const, error: error.message };
    }
    return { ok: true as const, id: messageId };
  });
