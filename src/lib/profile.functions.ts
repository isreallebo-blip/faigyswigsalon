import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, first_name, last_name, phone, avatar_url, last_login_at, created_at")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roleNames = (roles ?? []).map((r) => r.role as "admin" | "staff");

    const { data: authData } = await supabaseAdmin.auth.admin.getUserById(userId);
    const lastSignIn = authData?.user?.last_sign_in_at ?? null;

    return {
      ...profile,
      role: roleNames.includes("admin") ? ("admin" as const) : ("staff" as const),
      last_login_at: lastSignIn ?? profile?.last_login_at ?? null,
    };
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        first_name: z.string().trim().max(80).optional().nullable(),
        last_name: z.string().trim().max(80).optional().nullable(),
        phone: z.string().trim().max(40).optional().nullable(),
        avatar_url: z.string().trim().max(1024).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const full_name =
      [data.first_name, data.last_name].filter(Boolean).join(" ").trim() || null;
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        first_name: data.first_name ?? null,
        last_name: data.last_name ?? null,
        phone: data.phone ?? null,
        avatar_url: data.avatar_url ?? null,
        ...(full_name ? { full_name } : {}),
      })
      .eq("id", context.userId);
    if (error) throw error;
    return { ok: true };
  });
