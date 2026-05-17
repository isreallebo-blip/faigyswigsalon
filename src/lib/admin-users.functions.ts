import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRequestHost } from "@tanstack/react-start/server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Forbidden: admin only");
}

export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roleNames = (roles ?? []).map((r) => r.role as "admin" | "staff");
    return {
      userId,
      isAdmin: roleNames.includes("admin"),
      isStaff: roleNames.includes("staff") || roleNames.includes("admin"),
      roles: roleNames,
    };
  });

export const recordLastLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Verify the signed-in user is an active staff/admin. If not, the staff
    // login screen will sign them out — their client portal account (if any)
    // is unaffected.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("status")
      .eq("id", context.userId)
      .maybeSingle();

    if (!profile) {
      return { ok: false as const, reason: "not_staff" as const };
    }
    if (profile.status === "disabled") {
      return { ok: false as const, reason: "disabled" as const };
    }

    await supabaseAdmin
      .from("profiles")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", context.userId);
    return { ok: true as const };
  });

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, status, last_login_at, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    const roleMap = new Map<string, "admin" | "staff">();
    (roles ?? []).forEach((r) => {
      const cur = roleMap.get(r.user_id);
      // admin wins over staff
      if (r.role === "admin" || !cur) roleMap.set(r.user_id, r.role as "admin" | "staff");
    });

    // Pull auth bans to enrich status
    const { data: authList } = await supabaseAdmin.auth.admin.listUsers();
    const authMap = new Map<string, { banned_until: string | null; last_sign_in_at: string | null; confirmed_at: string | null }>();
    authList?.users.forEach((u) => {
      authMap.set(u.id, {
        banned_until: (u as unknown as { banned_until: string | null }).banned_until ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
        confirmed_at: u.confirmed_at ?? null,
      });
    });

    return (profiles ?? []).map((p) => {
      const a = authMap.get(p.id);
      let status: "active" | "invited" | "disabled" = (p.status as "active" | "invited" | "disabled") ?? "active";
      // profiles.status is authoritative for disabled. Only use auth state to
      // promote "active" → "invited" when email hasn't been confirmed yet.
      if (status !== "disabled" && !a?.confirmed_at) status = "invited";
      return {
        id: p.id,
        email: p.email,
        full_name: p.full_name,
        role: roleMap.get(p.id) ?? "staff",
        status,
        last_login_at: a?.last_sign_in_at ?? p.last_login_at,
      };
    });
  });

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        full_name: z.string().trim().min(1).max(120),
        role: z.enum(["admin", "staff"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const host = getRequestHost();
    const redirectTo = `https://${host}/reset-password`;

    const { data: invited, error } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
        data: { full_name: data.full_name },
        redirectTo,
      });
    if (error) throw error;
    const userId = invited.user!.id;

    // Ensure profile exists with name
    await supabaseAdmin
      .from("profiles")
      .upsert(
        { id: userId, email: data.email, full_name: data.full_name, status: "invited" },
        { onConflict: "id" },
      );

    // Reset roles to the chosen one
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: data.role });

    return { ok: true, user_id: userId };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        user_id: z.string().uuid(),
        role: z.enum(["admin", "staff"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.user_id === context.userId && data.role !== "admin") {
      throw new Error("You cannot remove admin from your own account.");
    }
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.user_id, role: data.role });
    return { ok: true };
  });

export const setUserStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        user_id: z.string().uuid(),
        status: z.enum(["active", "disabled"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.user_id === context.userId) {
      throw new Error("You cannot disable your own account.");
    }
    // Staff disable must NOT ban the auth.users record — that same account
    // may also be used for the client portal. We only flip the staff-side
    // status; is_staff() and the staff-login gate honor it.
    await supabaseAdmin
      .from("profiles")
      .update({ status: data.status })
      .eq("id", data.user_id);
    return { ok: true };
  });

export const resendInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: u } = await supabaseAdmin
      .from("profiles")
      .select("email, full_name")
      .eq("id", data.user_id)
      .maybeSingle();
    if (!u?.email) throw new Error("User has no email");
    const host = getRequestHost();
    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(u.email, {
      data: { full_name: u.full_name },
      redirectTo: `https://${host}/reset-password`,
    });
    if (error) throw error;
    return { ok: true };
  });
