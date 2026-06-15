import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import templateDefaultsJson from "./notification-template-defaults.json";

type TemplateDefault = {
  key: string;
  sms_body: string;
  email_subject: string;
  email_body: string;
};
const TEMPLATE_DEFAULTS: Record<string, TemplateDefault> = Object.fromEntries(
  (templateDefaultsJson as TemplateDefault[]).map((t) => [t.key, t]),
);

async function ensureAdmin(userId: string) {
  const { data } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Admins only");
}

const DaySchema = z.object({
  open: z.string().regex(/^\d{2}:\d{2}$/),
  close: z.string().regex(/^\d{2}:\d{2}$/),
  enabled: z.boolean(),
});

export const getMessagingSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const { data } = await supabaseAdmin
      .from("messaging_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    return data;
  });

export const updateMessagingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        business_hours: z.record(z.string(), DaySchema).optional(),
        timezone: z.string().min(1).optional(),
        auto_reply_enabled: z.boolean().optional(),
        auto_reply_body: z.string().max(1000).optional(),
        sms_cost_per_segment: z.number().min(0).max(10).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("messaging_settings")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(data as any)
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetTemplateToDefault = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ key: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const def = TEMPLATE_DEFAULTS[data.key];
    if (!def) throw new Error("No default available for this template");
    const { error } = await supabaseAdmin
      .from("notification_templates")
      .update({
        sms_body: def.sms_body,
        email_subject: def.email_subject,
        email_body: def.email_body,
      })
      .eq("key", data.key);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export function getTemplateDefault(key: string): TemplateDefault | null {
  return TEMPLATE_DEFAULTS[key] ?? null;
}
