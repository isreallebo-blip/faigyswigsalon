import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { sendNotification } from "@/lib/notifications/send.server";

async function assertStaff(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, status")
    .eq("id", userId)
    .maybeSingle();
  if (!data || data.status === "disabled") throw new Error("Forbidden");
  return data;
}

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: admin only");
}

function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [user, domain] = email.split("@");
  if (!user || !domain) return email;
  return `${user[0]}${"*".repeat(Math.max(user.length - 1, 1))}@${domain}`;
}

function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return phone;
  const last4 = digits.slice(-4);
  const masked = digits.length === 10
    ? `(***) ***-${last4}`
    : `+${digits.slice(0, digits.length - 10)} (***) ***-${last4}`;
  return masked;
}

async function getActorIp(): Promise<string | null> {
  try {
    return (
      getRequestHeader("cf-connecting-ip") ||
      getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ||
      getRequestHeader("x-real-ip") ||
      null
    );
  } catch {
    return null;
  }
}

async function logPortalEvent(opts: {
  clientId: string;
  actor: "staff" | "client" | "system";
  actorUserId?: string | null;
  actorName?: string | null;
  eventType: string;
  summary: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}) {
  await supabaseAdmin.from("portal_activity_log").insert({
    client_id: opts.clientId,
    actor: opts.actor,
    actor_user_id: opts.actorUserId ?? null,
    actor_name: opts.actorName ?? null,
    event_type: opts.eventType,
    summary: opts.summary,
    metadata: (opts.metadata ?? {}) as never,
    ip_address: opts.ip ?? null,
  });
}

async function logStaffAudit(opts: {
  userId: string;
  userName: string | null;
  userEmail: string | null;
  ip: string | null;
  clientId: string;
  clientLabel: string;
  clientDisplayId: string | null;
  action: "create" | "update" | "delete" | "view";
  summary: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}) {
  await supabaseAdmin.from("audit_logs").insert({
    user_id: opts.userId,
    user_name: opts.userName,
    user_email: opts.userEmail,
    ip_address: opts.ip,
    action: opts.action,
    module: "client",
    record_id: opts.clientId,
    record_label: opts.clientDisplayId
      ? `${opts.clientDisplayId} · ${opts.clientLabel}`
      : opts.clientLabel,
    summary: opts.summary,
    before: (opts.before ?? null) as never,
    after: (opts.after ?? null) as never,
  });
}

async function deriveStatus(clientRow: {
  auth_user_id: string | null;
  portal_status: string | null;
}): Promise<
  "not_signed_up" | "active" | "locked" | "disabled" | "pending_verification"
> {
  if (!clientRow.auth_user_id) return "not_signed_up";
  const stored = clientRow.portal_status as
    | "not_signed_up"
    | "active"
    | "locked"
    | "disabled"
    | "pending_verification"
    | null;
  if (stored === "locked" || stored === "disabled" || stored === "pending_verification")
    return stored;

  // Check auth state for verification
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(clientRow.auth_user_id);
    const u = data.user;
    if (u) {
      const confirmedAt = (u as unknown as { confirmed_at: string | null }).confirmed_at;
      if (!confirmedAt) return "pending_verification";
    }
  } catch {
    /* ignore */
  }
  return "active";
}

export const getClientPortalAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { data: client, error } = await supabaseAdmin
      .from("clients")
      .select(
        "id, full_name, display_id, email, phone, auth_user_id, portal_status, portal_signup_at, portal_signup_method, portal_last_login_at, portal_invite_sent_at, portal_locked_at, portal_lock_reason, portal_lock_auto, portal_disabled_at, portal_failed_login_count, portal_last_failed_login_at",
      )
      .eq("id", data.clientId)
      .single();
    if (error) throw error;

    const status = await deriveStatus(client);

    // Activity log (last 50)
    const { data: activity } = await supabaseAdmin
      .from("portal_activity_log")
      .select("id, event_type, summary, actor, actor_name, ip_address, created_at, metadata")
      .eq("client_id", data.clientId)
      .order("created_at", { ascending: false })
      .limit(50);

    return {
      status,
      clientId: client.id,
      clientName: client.full_name,
      displayId: client.display_id,
      authUserId: client.auth_user_id,
      signupAt: client.portal_signup_at,
      signupMethod: client.portal_signup_method,
      lastLoginAt: client.portal_last_login_at,
      inviteSentAt: client.portal_invite_sent_at,
      lockedAt: client.portal_locked_at,
      lockReason: client.portal_lock_reason,
      lockAuto: client.portal_lock_auto,
      disabledAt: client.portal_disabled_at,
      failedLoginCount: client.portal_failed_login_count,
      lastFailedLoginAt: client.portal_last_failed_login_at,
      maskedEmail: maskEmail(client.email),
      maskedPhone: maskPhone(client.phone),
      hasEmail: !!client.email,
      hasPhone: !!client.phone,
      activity: activity ?? [],
    };
  });

export const getClientPortalActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { data: rows } = await supabaseAdmin
      .from("portal_activity_log")
      .select("*")
      .eq("client_id", data.clientId)
      .order("created_at", { ascending: false })
      .limit(500);
    return rows ?? [];
  });

async function loadClient(clientId: string) {
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single();
  if (error) throw error;
  return data;
}

export const sendPortalInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const staff = await assertStaff(context.userId);
    const ip = await getActorIp();
    const client = await loadClient(data.clientId);
    if (!client.email && !client.phone)
      throw new Error("Client has no email or phone on file");

    const host = getRequestHost();
    const portalLink = `https://${host}/portal/signup`;

    await sendNotification({
      clientId: client.id,
      templateKey: "portal_invite",
      vars: { firstName: client.full_name.split(" ")[0] ?? "", portalLink },
    });

    await supabaseAdmin
      .from("clients")
      .update({
        portal_invite_sent_at: new Date().toISOString(),
        portal_invite_sent_by: context.userId,
      })
      .eq("id", client.id);

    await logPortalEvent({
      clientId: client.id,
      actor: "staff",
      actorUserId: context.userId,
      actorName: staff.full_name ?? staff.email,
      eventType: "invite_sent",
      summary: `Portal invite sent by ${staff.full_name ?? staff.email}`,
      ip,
      metadata: { portalLink },
    });
    await logStaffAudit({
      userId: context.userId,
      userName: staff.full_name ?? null,
      userEmail: staff.email ?? null,
      ip,
      clientId: client.id,
      clientLabel: client.full_name,
      clientDisplayId: client.display_id,
      action: "update",
      summary: `Sent portal invite to ${client.full_name}`,
    });
    return { ok: true };
  });

export const sendPortalPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const staff = await assertStaff(context.userId);
    const ip = await getActorIp();
    const client = await loadClient(data.clientId);
    if (!client.auth_user_id) throw new Error("Client has not signed up yet");
    if (!client.email) throw new Error("Client has no email on file for reset");

    const host = getRequestHost();
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: client.email,
      options: { redirectTo: `https://${host}/reset-password` },
    });
    if (linkErr) throw linkErr;
    const resetLink = linkData.properties?.action_link ?? "";

    await sendNotification({
      clientId: client.id,
      templateKey: "portal_password_reset",
      vars: { firstName: client.full_name.split(" ")[0] ?? "", resetLink },
    });

    await logPortalEvent({
      clientId: client.id,
      actor: "staff",
      actorUserId: context.userId,
      actorName: staff.full_name ?? staff.email,
      eventType: "password_reset_sent",
      summary: `Password reset link sent by ${staff.full_name ?? staff.email}`,
      ip,
    });
    await logStaffAudit({
      userId: context.userId,
      userName: staff.full_name ?? null,
      userEmail: staff.email ?? null,
      ip,
      clientId: client.id,
      clientLabel: client.full_name,
      clientDisplayId: client.display_id,
      action: "update",
      summary: `Sent password reset to ${client.full_name}`,
    });
    return { ok: true, maskedTo: maskEmail(client.email) };
  });

const LOCK_REASONS = [
  "suspicious_activity",
  "client_request",
  "outstanding_balance",
  "other",
] as const;

export const lockClientPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clientId: z.string().uuid(),
        reason: z.enum(LOCK_REASONS),
        reasonText: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const staff = await assertStaff(context.userId);
    const ip = await getActorIp();
    const client = await loadClient(data.clientId);
    if (!client.auth_user_id) throw new Error("Client has not signed up");

    // Ban for 100 years
    await supabaseAdmin.auth.admin.updateUserById(client.auth_user_id, {
      ban_duration: "876000h",
    });

    const reasonLabel =
      data.reason === "other" ? (data.reasonText ?? "Other") : data.reason;

    await supabaseAdmin
      .from("clients")
      .update({
        portal_status: "locked",
        portal_locked_at: new Date().toISOString(),
        portal_locked_by: context.userId,
        portal_lock_reason: reasonLabel,
        portal_lock_auto: false,
      })
      .eq("id", client.id);

    await logPortalEvent({
      clientId: client.id,
      actor: "staff",
      actorUserId: context.userId,
      actorName: staff.full_name ?? staff.email,
      eventType: "locked",
      summary: `Account locked by ${staff.full_name ?? staff.email} — reason: ${reasonLabel}`,
      ip,
      metadata: { reason: data.reason, reasonText: data.reasonText },
    });
    await logStaffAudit({
      userId: context.userId,
      userName: staff.full_name ?? null,
      userEmail: staff.email ?? null,
      ip,
      clientId: client.id,
      clientLabel: client.full_name,
      clientDisplayId: client.display_id,
      action: "update",
      summary: `Locked portal for ${client.full_name} (${reasonLabel})`,
    });
    return { ok: true };
  });

export const unlockClientPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const staff = await assertStaff(context.userId);
    const ip = await getActorIp();
    const client = await loadClient(data.clientId);
    if (!client.auth_user_id) throw new Error("Client has not signed up");

    await supabaseAdmin.auth.admin.updateUserById(client.auth_user_id, {
      ban_duration: "none",
    });

    await supabaseAdmin
      .from("clients")
      .update({
        portal_status: "active",
        portal_locked_at: null,
        portal_locked_by: null,
        portal_lock_reason: null,
        portal_lock_auto: false,
        portal_failed_login_count: 0,
        portal_last_failed_login_at: null,
      })
      .eq("id", client.id);

    const portalLoginLink = `https://${getRequestHost()}/portal/login`;
    await sendNotification({
      clientId: client.id,
      templateKey: "portal_unlocked",
      vars: { firstName: client.full_name.split(" ")[0] ?? "", portalLink: portalLoginLink },
    });

    await logPortalEvent({
      clientId: client.id,
      actor: "staff",
      actorUserId: context.userId,
      actorName: staff.full_name ?? staff.email,
      eventType: "unlocked",
      summary: `Account unlocked by ${staff.full_name ?? staff.email}`,
      ip,
    });
    await logStaffAudit({
      userId: context.userId,
      userName: staff.full_name ?? null,
      userEmail: staff.email ?? null,
      ip,
      clientId: client.id,
      clientLabel: client.full_name,
      clientDisplayId: client.display_id,
      action: "update",
      summary: `Unlocked portal for ${client.full_name}`,
    });
    return { ok: true };
  });

export const disableClientPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const staff = await assertStaff(context.userId);
    const ip = await getActorIp();
    const client = await loadClient(data.clientId);
    if (!client.auth_user_id) throw new Error("Client has not signed up");

    await supabaseAdmin.auth.admin.updateUserById(client.auth_user_id, {
      ban_duration: "876000h",
    });

    await supabaseAdmin
      .from("clients")
      .update({
        portal_status: "disabled",
        portal_disabled_at: new Date().toISOString(),
        portal_disabled_by: context.userId,
      })
      .eq("id", client.id);

    await logPortalEvent({
      clientId: client.id,
      actor: "staff",
      actorUserId: context.userId,
      actorName: staff.full_name ?? staff.email,
      eventType: "disabled",
      summary: `Portal access disabled by ${staff.full_name ?? staff.email}`,
      ip,
    });
    await logStaffAudit({
      userId: context.userId,
      userName: staff.full_name ?? null,
      userEmail: staff.email ?? null,
      ip,
      clientId: client.id,
      clientLabel: client.full_name,
      clientDisplayId: client.display_id,
      action: "update",
      summary: `Disabled portal for ${client.full_name}`,
    });
    return { ok: true };
  });

export const enableClientPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const staff = await assertStaff(context.userId);
    const ip = await getActorIp();
    const client = await loadClient(data.clientId);
    if (!client.auth_user_id) throw new Error("Client has not signed up");

    await supabaseAdmin.auth.admin.updateUserById(client.auth_user_id, {
      ban_duration: "none",
    });

    await supabaseAdmin
      .from("clients")
      .update({
        portal_status: "active",
        portal_disabled_at: null,
        portal_disabled_by: null,
      })
      .eq("id", client.id);

    await sendNotification({
      clientId: client.id,
      templateKey: "portal_unlocked",
      vars: { firstName: client.full_name.split(" ")[0] ?? "" },
    });

    await logPortalEvent({
      clientId: client.id,
      actor: "staff",
      actorUserId: context.userId,
      actorName: staff.full_name ?? staff.email,
      eventType: "enabled",
      summary: `Portal access restored by ${staff.full_name ?? staff.email}`,
      ip,
    });
    await logStaffAudit({
      userId: context.userId,
      userName: staff.full_name ?? null,
      userEmail: staff.email ?? null,
      ip,
      clientId: client.id,
      clientLabel: client.full_name,
      clientDisplayId: client.display_id,
      action: "update",
      summary: `Re-enabled portal for ${client.full_name}`,
    });
    return { ok: true };
  });

export const signOutAllPortalDevices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const staff = await assertStaff(context.userId);
    const ip = await getActorIp();
    const client = await loadClient(data.clientId);
    if (!client.auth_user_id) throw new Error("Client has not signed up");

    await supabaseAdmin.auth.admin.signOut(client.auth_user_id, "global");

    await sendNotification({
      clientId: client.id,
      templateKey: "portal_signed_out_all",
      vars: { firstName: client.full_name.split(" ")[0] ?? "" },
    });

    await logPortalEvent({
      clientId: client.id,
      actor: "staff",
      actorUserId: context.userId,
      actorName: staff.full_name ?? staff.email,
      eventType: "signed_out_all",
      summary: `All devices signed out by ${staff.full_name ?? staff.email}`,
      ip,
    });
    await logStaffAudit({
      userId: context.userId,
      userName: staff.full_name ?? null,
      userEmail: staff.email ?? null,
      ip,
      clientId: client.id,
      clientLabel: client.full_name,
      clientDisplayId: client.display_id,
      action: "update",
      summary: `Signed out all portal devices for ${client.full_name}`,
    });
    return { ok: true };
  });

export const listPortalAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        status: z
          .enum([
            "all",
            "active",
            "locked",
            "disabled",
            "pending_verification",
            "never_logged_in",
            "not_signed_up",
          ])
          .default("all"),
        search: z.string().trim().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    let q = supabaseAdmin
      .from("clients")
      .select(
        "id, full_name, display_id, email, phone, auth_user_id, portal_status, portal_signup_at, portal_signup_method, portal_last_login_at",
      )
      .order("created_at", { ascending: false })
      .limit(2000);

    if (data.status === "never_logged_in") {
      q = q.is("portal_last_login_at", null).not("auth_user_id", "is", null);
    } else if (data.status === "not_signed_up") {
      q = q.is("auth_user_id", null);
    } else if (data.status !== "all") {
      q = q.eq("portal_status", data.status);
    }

    if (data.search) {
      const s = `%${data.search}%`;
      q = q.or(
        `full_name.ilike.${s},email.ilike.${s},phone.ilike.${s},display_id.ilike.${s}`,
      );
    }

    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const bulkPortalAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clientIds: z.array(z.string().uuid()).min(1).max(500),
        action: z.enum(["invite", "lock", "disable"]),
        reason: z.enum(LOCK_REASONS).optional(),
        reasonText: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let ok = 0;
    let failed = 0;
    for (const id of data.clientIds) {
      try {
        if (data.action === "invite") {
          await sendPortalInvite({ data: { clientId: id } });
        } else if (data.action === "lock") {
          await lockClientPortal({
            data: { clientId: id, reason: data.reason ?? "other", reasonText: data.reasonText },
          });
        } else if (data.action === "disable") {
          await disableClientPortal({ data: { clientId: id } });
        }
        ok++;
      } catch {
        failed++;
      }
    }
    return { ok, failed };
  });

// Called from portal login flow to track success/failure & auto-lock at 5 strikes
export const recordPortalLoginAttempt = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        emailOrPhone: z.string().trim().min(1).max(255),
        success: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const ip =
      (await getActorIp()) ?? null;
    const q = data.emailOrPhone.includes("@")
      ? supabaseAdmin
          .from("clients")
          .select("id, full_name, auth_user_id, portal_failed_login_count, portal_status")
          .eq("email", data.emailOrPhone.toLowerCase())
          .maybeSingle()
      : supabaseAdmin
          .from("clients")
          .select("id, full_name, auth_user_id, portal_failed_login_count, portal_status")
          .eq("phone", data.emailOrPhone)
          .maybeSingle();
    const { data: client } = await q;
    if (!client) return { ok: true };

    if (data.success) {
      await supabaseAdmin
        .from("clients")
        .update({
          portal_failed_login_count: 0,
          portal_last_failed_login_at: null,
          portal_last_login_at: new Date().toISOString(),
          portal_signup_at: client.auth_user_id
            ? undefined
            : new Date().toISOString(),
          portal_status: client.portal_status === "locked" || client.portal_status === "disabled"
            ? client.portal_status
            : "active",
        })
        .eq("id", client.id);
      await logPortalEvent({
        clientId: client.id,
        actor: "client",
        eventType: "login_success",
        summary: "Client signed in",
        ip,
      });
      return { ok: true };
    }

    const newCount = (client.portal_failed_login_count ?? 0) + 1;
    const shouldLock = newCount >= 5 && client.auth_user_id;
    await supabaseAdmin
      .from("clients")
      .update({
        portal_failed_login_count: newCount,
        portal_last_failed_login_at: new Date().toISOString(),
        ...(shouldLock
          ? {
              portal_status: "locked",
              portal_locked_at: new Date().toISOString(),
              portal_lock_reason: "Auto-locked after 5 failed login attempts",
              portal_lock_auto: true,
            }
          : {}),
      })
      .eq("id", client.id);

    await logPortalEvent({
      clientId: client.id,
      actor: "system",
      eventType: "login_failed",
      summary: `Failed login attempt (${newCount}/5)`,
      ip,
    });

    if (shouldLock && client.auth_user_id) {
      try {
        await supabaseAdmin.auth.admin.updateUserById(client.auth_user_id, {
          ban_duration: "876000h",
        });
      } catch {
        /* ignore */
      }
      await sendNotification({
        clientId: client.id,
        templateKey: "portal_locked_auto",
        vars: { firstName: client.full_name.split(" ")[0] ?? "" },
      });
      await logPortalEvent({
        clientId: client.id,
        actor: "system",
        eventType: "auto_locked",
        summary: "Account auto-locked after 5 failed login attempts",
        ip,
      });
    }
    return { ok: true, locked: shouldLock };
  });
