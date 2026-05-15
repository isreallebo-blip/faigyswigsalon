import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Idempotent first-time admin bootstrap.
 * If no admin exists yet and ADMIN_EMAIL/ADMIN_PASSWORD are configured,
 * create that user (email confirmed) and grant them the admin role.
 */
export const ensureBootstrapAdmin = createServerFn({ method: "POST" }).handler(
  async () => {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) return { ok: false, reason: "missing-env" };

    const { count, error: countErr } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if (countErr) throw countErr;
    if ((count ?? 0) > 0) return { ok: true, created: false };

    // Look for an existing user with this email.
    let userId: string | null = null;
    const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
    const found = existing?.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );
    if (found) {
      userId = found.id;
    } else {
      const { data: created, error: createErr } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: "Admin" },
        });
      if (createErr) throw createErr;
      userId = created.user!.id;
    }

    if (!userId) return { ok: false, reason: "no-user" };

    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
    await supabaseAdmin
      .from("profiles")
      .update({ status: "active" })
      .eq("id", userId);

    return { ok: true, created: !found };
  },
);
