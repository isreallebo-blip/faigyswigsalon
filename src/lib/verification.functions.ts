// Server functions for verification & sensitive-action gating.
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  CODE_TTL_MIN,
  LOCKOUT_MIN,
  MAX_ATTEMPTS,
  VERIFIED_TTL_MIN,
  actionConfirmHtml,
  alertEmailHtml,
  auditVerify,
  generateCode,
  hashCode,
  maskEmail,
  maskPhone,
  sendCodeVia,
  sendEmail,
  sendSmsRaw,
} from "./verification.server";
import { randomBytes } from "crypto";

type Subject = "staff" | "client";

function getIp(): string | null {
  return (
    getRequestHeader("cf-connecting-ip") ||
    getRequestHeader("x-real-ip") ||
    (getRequestHeader("x-forwarded-for")?.split(",")[0].trim() ?? null) ||
    null
  );
}

// Resolve which subject this auth user maps to (staff profile or client portal).
async function resolveSubject(authUserId: string): Promise<{
  subject: Subject;
  userId: string; // canonical id for verification rows
  email: string | null;
  phone: string | null;
  authUserId: string;
  authEmail: string | null;
  fullName: string | null;
}> {
  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, email, phone, full_name")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (client) {
    return {
      subject: "client",
      userId: client.id,
      email: client.email,
      phone: client.phone,
      authUserId,
      authEmail: client.email,
      fullName: client.full_name,
    };
  }
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, email, phone, full_name")
    .eq("id", authUserId)
    .maybeSingle();
  return {
    subject: "staff",
    userId: authUserId,
    email: profile?.email ?? null,
    phone: profile?.phone ?? null,
    authUserId,
    authEmail: profile?.email ?? null,
    fullName: profile?.full_name ?? null,
  };
}

async function getLockedUntil(userId: string, subject: Subject): Promise<Date | null> {
  const { data } = await supabaseAdmin
    .from("verification_lockouts")
    .select("locked_until")
    .eq("user_id", userId)
    .eq("subject_type", subject)
    .gt("locked_until", new Date().toISOString())
    .order("locked_until", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.locked_until ? new Date(data.locked_until) : null;
}

async function getVerifiedUntil(userId: string, subject: Subject): Promise<Date | null> {
  const { data } = await supabaseAdmin
    .from("verified_sessions")
    .select("expires_at")
    .eq("user_id", userId)
    .eq("subject_type", subject)
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.expires_at ? new Date(data.expires_at) : null;
}

// ─── Status ────────────────────────────────────────────────────────────────

export const getVerificationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = await resolveSubject(context.userId);
    const [locked, verified] = await Promise.all([
      getLockedUntil(s.userId, s.subject),
      getVerifiedUntil(s.userId, s.subject),
    ]);
    return {
      subject: s.subject,
      hasEmail: !!s.email,
      hasPhone: !!s.phone,
      maskedEmail: s.email ? maskEmail(s.email) : null,
      maskedPhone: s.phone ? maskPhone(s.phone) : null,
      lockedUntil: locked?.toISOString() ?? null,
      verifiedUntil: verified?.toISOString() ?? null,
    };
  });

// ─── Request code ──────────────────────────────────────────────────────────

export const requestVerificationCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        channel: z.enum(["email", "sms"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const s = await resolveSubject(context.userId);
    const ip = getIp();

    const locked = await getLockedUntil(s.userId, s.subject);
    if (locked) {
      return { ok: false, lockedUntil: locked.toISOString(), error: "locked" };
    }

    // Pick channel
    let channel: "email" | "sms" | null = data.channel ?? null;
    if (!channel) channel = s.email ? "email" : s.phone ? "sms" : null;
    if (!channel) return { ok: false, error: "No email or phone on file" };
    if (channel === "email" && !s.email) return { ok: false, error: "No email on file" };
    if (channel === "sms" && !s.phone) return { ok: false, error: "No phone on file" };

    const destination = channel === "email" ? s.email! : s.phone!;
    const masked = channel === "email" ? maskEmail(destination) : maskPhone(destination);
    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60_000);

    const { data: ch, error: insErr } = await supabaseAdmin
      .from("verification_challenges")
      .insert({
        user_id: s.userId,
        subject_type: s.subject,
        purpose: "reauth",
        channel,
        destination_masked: masked,
        code_hash: hashCode(code),
        expires_at: expiresAt.toISOString(),
        ip_address: ip,
      })
      .select("id")
      .single();
    if (insErr || !ch) return { ok: false, error: insErr?.message ?? "Could not start verification" };

    const send = await sendCodeVia(channel, destination, code);
    await auditVerify({
      userId: s.authUserId,
      userEmail: s.authEmail,
      userName: s.fullName,
      ip,
      summary: `Verification code requested via ${channel}`,
      details: { challenge_id: ch.id, channel, masked, sent: send.ok, error: send.error ?? null },
    });
    if (!send.ok) return { ok: false, error: send.error ?? "Failed to send code" };

    return {
      ok: true,
      challengeId: ch.id,
      channel,
      maskedDestination: masked,
      expiresAt: expiresAt.toISOString(),
    };
  });

// ─── Verify code ───────────────────────────────────────────────────────────

export const verifyCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        challengeId: z.string().uuid(),
        code: z.string().trim().regex(/^\d{6}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const s = await resolveSubject(context.userId);
    const ip = getIp();

    const locked = await getLockedUntil(s.userId, s.subject);
    if (locked) return { ok: false, lockedUntil: locked.toISOString(), error: "locked" };

    const { data: ch } = await supabaseAdmin
      .from("verification_challenges")
      .select("*")
      .eq("id", data.challengeId)
      .eq("user_id", s.userId)
      .eq("subject_type", s.subject)
      .maybeSingle();
    if (!ch) return { ok: false, error: "Challenge not found" };
    if (ch.consumed_at) return { ok: false, error: "Code already used" };
    if (new Date(ch.expires_at).getTime() < Date.now())
      return { ok: false, error: "Code expired. Request a new one." };

    const isMatch = hashCode(data.code) === ch.code_hash;
    if (!isMatch) {
      const attempts = (ch.attempts ?? 0) + 1;
      await supabaseAdmin
        .from("verification_challenges")
        .update({ attempts })
        .eq("id", ch.id);
      const remaining = MAX_ATTEMPTS - attempts;
      await auditVerify({
        userId: s.authUserId,
        userEmail: s.authEmail,
        userName: s.fullName,
        ip,
        summary: `Verification code failed (attempt ${attempts}/${MAX_ATTEMPTS})`,
        details: { challenge_id: ch.id, attempts },
      });
      if (attempts >= MAX_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + LOCKOUT_MIN * 60_000);
        await supabaseAdmin.from("verification_lockouts").insert({
          user_id: s.userId,
          subject_type: s.subject,
          locked_until: lockedUntil.toISOString(),
          reason: "Too many failed verification attempts",
        });
        await auditVerify({
          userId: s.authUserId,
          userEmail: s.authEmail,
          userName: s.fullName,
          ip,
          summary: `Account locked for ${LOCKOUT_MIN} minutes after ${MAX_ATTEMPTS} failed attempts`,
          details: { locked_until: lockedUntil.toISOString() },
          action: "update",
        });
        // Alert email to the user
        if (s.email) {
          await sendEmail(s.email, "Security alert — Faigy's Wig Salon", alertEmailHtml(new Date())).catch(() => null);
        }
        return { ok: false, lockedUntil: lockedUntil.toISOString(), error: "locked" };
      }
      return { ok: false, attemptsRemaining: remaining, error: "Incorrect code" };
    }

    // Mark challenge consumed and open verified session.
    const verifiedUntil = new Date(Date.now() + VERIFIED_TTL_MIN * 60_000);
    await supabaseAdmin
      .from("verification_challenges")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", ch.id);
    await supabaseAdmin.from("verified_sessions").insert({
      user_id: s.userId,
      subject_type: s.subject,
      expires_at: verifiedUntil.toISOString(),
    });
    await auditVerify({
      userId: s.authUserId,
      userEmail: s.authEmail,
      userName: s.fullName,
      ip,
      summary: "Identity verified successfully",
      details: { verified: true, verified_until: verifiedUntil.toISOString() },
    });
    return { ok: true, verifiedUntil: verifiedUntil.toISOString() };
  });

// ─── Guard helper ──────────────────────────────────────────────────────────

async function requireVerified(authUserId: string) {
  const s = await resolveSubject(authUserId);
  const until = await getVerifiedUntil(s.userId, s.subject);
  if (!until) throw new Error("Verification required");
  return s;
}

// ─── Change password ───────────────────────────────────────────────────────

const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .regex(/[A-Z]/, "Must include an uppercase letter")
  .regex(/[0-9]/, "Must include a number")
  .regex(/[^A-Za-z0-9]/, "Must include a special character");

export const changePasswordVerified = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ newPassword: passwordSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const s = await requireVerified(context.userId);
    const ip = getIp();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(s.authUserId, {
      password: data.newPassword,
    });
    if (error) throw new Error(error.message);
    // Best-effort sign out other sessions
    try {
      await (supabaseAdmin.auth.admin as unknown as {
        signOut: (uid: string, scope?: string) => Promise<unknown>;
      }).signOut(s.authUserId, "others");
    } catch {
      /* ignore */
    }
    if (s.email) {
      await sendEmail(s.email, "Your password was changed", actionConfirmHtml("password")).catch(() => null);
    }
    await auditVerify({
      userId: s.authUserId,
      userEmail: s.authEmail,
      userName: s.fullName,
      ip,
      summary: "Password changed (verified)",
      details: { verified: true },
      action: "update",
    });
    return { ok: true };
  });

// ─── Email change (link confirm) ───────────────────────────────────────────

export const requestEmailChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ newEmail: z.string().trim().email().max(255) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const s = await requireVerified(context.userId);
    const ip = getIp();
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60_000);
    await supabaseAdmin.from("pending_email_changes").insert({
      user_id: s.userId,
      subject_type: s.subject,
      old_email: s.email,
      new_email: data.newEmail,
      confirm_token: token,
      expires_at: expiresAt.toISOString(),
    });
    const base =
      getRequestHeader("origin") ||
      `https://${getRequestHeader("host") ?? "faigyswigsalon.com"}`;
    const link = `${base}/api/public/confirm-email-change?token=${token}`;
    await sendEmail(
      data.newEmail,
      "Confirm your new email",
      `<!doctype html><html><body style="font-family:Georgia,serif;background:#faf6ef;padding:24px;">
       <div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e8dcc4;border-radius:6px;padding:24px;">
         <h2 style="margin:0 0 12px;color:#bfa15a;">Confirm your new email</h2>
         <p>Click below to confirm this as your new email for Faigy's Wig Salon.</p>
         <p><a href="${link}" style="background:#bfa15a;color:#fff;padding:12px 18px;border-radius:4px;text-decoration:none;">Confirm email</a></p>
         <p style="font-size:12px;color:#8b7a5b;">This link expires in 24 hours.</p>
       </div></body></html>`,
    );
    if (s.email) {
      await sendEmail(
        s.email,
        "Your email address is being changed",
        `<!doctype html><html><body style="font-family:Georgia,serif;background:#faf6ef;padding:24px;">
         <div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e8dcc4;border-radius:6px;padding:24px;">
           <p>Your email address on Faigy's Wig Salon is being changed to ${maskEmail(data.newEmail)}.</p>
           <p>If you did not do this, please contact us immediately.</p>
         </div></body></html>`,
      ).catch(() => null);
    }
    await auditVerify({
      userId: s.authUserId,
      userEmail: s.authEmail,
      userName: s.fullName,
      ip,
      summary: `Email change requested to ${maskEmail(data.newEmail)}`,
      details: { verified: true, new_email_masked: maskEmail(data.newEmail) },
      action: "update",
    });
    return { ok: true };
  });

export const getPendingEmailChange = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = await resolveSubject(context.userId);
    const { data } = await supabaseAdmin
      .from("pending_email_changes")
      .select("new_email, expires_at")
      .eq("user_id", s.userId)
      .eq("subject_type", s.subject)
      .is("confirmed_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? { newEmail: maskEmail(data.new_email), expiresAt: data.expires_at } : null;
  });

// ─── Phone change ──────────────────────────────────────────────────────────

export const requestPhoneChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ newPhone: z.string().trim().min(7).max(40) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const s = await requireVerified(context.userId);
    const ip = getIp();
    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60_000);
    await supabaseAdmin.from("pending_phone_changes").insert({
      user_id: s.userId,
      subject_type: s.subject,
      old_phone: s.phone,
      new_phone: data.newPhone,
      code_hash: hashCode(code),
      expires_at: expiresAt.toISOString(),
    });
    const send = await sendSmsRaw(
      data.newPhone,
      `Faigy's Wig Salon: confirm your new phone with code ${code} (expires in ${CODE_TTL_MIN} min)`,
    );
    if (s.phone) {
      await sendSmsRaw(
        s.phone,
        `Faigy's Wig Salon: your phone number is being changed. If this wasn't you, contact us right away.`,
      ).catch(() => null);
    }
    await auditVerify({
      userId: s.authUserId,
      userEmail: s.authEmail,
      userName: s.fullName,
      ip,
      summary: `Phone change requested to ${maskPhone(data.newPhone)}`,
      details: { verified: true, sent: !send.error },
      action: "update",
    });
    if (send.error) throw new Error(send.error);
    return { ok: true, expiresAt: expiresAt.toISOString() };
  });

export const confirmPhoneChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ code: z.string().trim().regex(/^\d{6}$/) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const s = await resolveSubject(context.userId);
    const ip = getIp();
    const { data: pending } = await supabaseAdmin
      .from("pending_phone_changes")
      .select("*")
      .eq("user_id", s.userId)
      .eq("subject_type", s.subject)
      .is("confirmed_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!pending) throw new Error("No pending phone change");
    if ((pending.attempts ?? 0) >= MAX_ATTEMPTS) throw new Error("Too many attempts. Request a new code.");
    if (hashCode(data.code) !== pending.code_hash) {
      await supabaseAdmin
        .from("pending_phone_changes")
        .update({ attempts: (pending.attempts ?? 0) + 1 })
        .eq("id", pending.id);
      throw new Error("Incorrect code");
    }
    await supabaseAdmin
      .from("pending_phone_changes")
      .update({ confirmed_at: new Date().toISOString() })
      .eq("id", pending.id);
    if (s.subject === "staff") {
      await supabaseAdmin.from("profiles").update({ phone: pending.new_phone }).eq("id", s.userId);
    } else {
      await supabaseAdmin.from("clients").update({ phone: pending.new_phone }).eq("id", s.userId);
    }
    await auditVerify({
      userId: s.authUserId,
      userEmail: s.authEmail,
      userName: s.fullName,
      ip,
      summary: "Phone number changed (verified)",
      details: { verified: true },
      action: "update",
    });
    return { ok: true };
  });

// ─── Admin: reset lockout ──────────────────────────────────────────────────

export const adminResetLockout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        subject: z.enum(["staff", "client"]).default("staff"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Admin check
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Forbidden");
    if (data.userId === context.userId) throw new Error("You cannot reset your own lockout");

    await supabaseAdmin
      .from("verification_lockouts")
      .delete()
      .eq("user_id", data.userId)
      .eq("subject_type", data.subject)
      .gt("locked_until", new Date().toISOString());

    const { data: actor } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    await auditVerify({
      userId: context.userId,
      userEmail: actor?.email ?? null,
      userName: actor?.full_name ?? null,
      ip: getIp(),
      summary: `Admin reset verification lockout for user ${data.userId}`,
      details: { target_user: data.userId, subject: data.subject },
      action: "update",
    });
    return { ok: true };
  });
