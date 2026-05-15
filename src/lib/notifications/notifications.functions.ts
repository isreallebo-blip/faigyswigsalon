import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendNotification, formatDateParts } from "./send.server";

// Trigger from app code after a domain event happens.
export const triggerNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      templateKey: z.string().min(1),
      vars: z.record(z.string(), z.string().optional()).optional(),
      idempotencyKey: z.string().optional(),
      receiptData: z
        .object({
          clientName: z.string(),
          cltId: z.string(),
          date: z.string(),
          hebrewDate: z.string(),
          amount: z.string(),
          method: z.string(),
          description: z.string(),
          balance: z.string().optional(),
        })
        .optional(),
    }),
  )
  .handler(async ({ data }) => {
    return sendNotification({
      clientId: data.clientId,
      templateKey: data.templateKey,
      vars: data.vars,
      idempotencyKey: data.idempotencyKey,
      receiptData: data.receiptData,
    });
  });

// Resend from the activity log.
export const resendNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ logId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { data: log } = await supabaseAdmin
      .from("notification_log")
      .select("*")
      .eq("id", data.logId)
      .maybeSingle();
    if (!log || !log.client_id) throw new Error("Log not found");
    return sendNotification({
      clientId: log.client_id,
      templateKey: log.template_key,
      idempotencyKey: `resend-${log.id}-${Date.now()}`,
    });
  });

export const listClientNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ clientId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { data: rows } = await supabaseAdmin
      .from("notification_log")
      .select("id, created_at, template_key, channel, recipient, status, error_message, subject")
      .eq("client_id", data.clientId)
      .order("created_at", { ascending: false })
      .limit(200);
    return { rows: rows ?? [] };
  });

// Templates (admin)
export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data } = await supabaseAdmin
      .from("notification_templates")
      .select("*")
      .order("category")
      .order("label");
    return { rows: data ?? [] };
  });

export const updateTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      enabled: z.boolean().optional(),
      send_sms: z.boolean().optional(),
      send_email: z.boolean().optional(),
      sms_body: z.string().max(2000).optional(),
      email_subject: z.string().max(200).optional(),
      email_body: z.string().max(20000).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { id, ...patch } = data;
    const { error } = await supabaseAdmin
      .from("notification_templates")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(patch as any)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Portal: client preferences
export const getMyNotificationPrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("clients")
      .select("sms_opt_in, email_opt_in, phone, email")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    return data ?? { sms_opt_in: true, email_opt_in: true, phone: null, email: null };
  });

export const updateMyNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ sms_opt_in: z.boolean(), email_opt_in: z.boolean() }))
  .handler(async ({ data, context }) => {
    if (!data.sms_opt_in && !data.email_opt_in) {
      throw new Error("At least one notification channel must remain on.");
    }
    const { error } = await supabaseAdmin
      .from("clients")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(data as any)
      .eq("auth_user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Helper for callers that already have the appointment row.
export function appointmentVars(starts_at: string, type?: string | null) {
  const p = formatDateParts(starts_at);
  return { ...p, appointmentType: type ?? "", appointmentDate: p.date };
}
