import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const dayHoursSchema = z.object({
  enabled: z.boolean(),
  open: z.string().regex(/^\d{2}:\d{2}$/),
  close: z.string().regex(/^\d{2}:\d{2}$/),
});

const businessHoursSchema = z.object({
  sun: dayHoursSchema,
  mon: dayHoursSchema,
  tue: dayHoursSchema,
  wed: dayHoursSchema,
  thu: dayHoursSchema,
  fri: dayHoursSchema,
  sat: dayHoursSchema,
});

export type DayKey = keyof z.infer<typeof businessHoursSchema>;

export const getMessagingSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("messaging_settings")
      .select("id, business_hours, timezone, auto_reply_enabled, auto_reply_body")
      .eq("id", 1)
      .maybeSingle();
    return data;
  });

export const updateMessagingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      business_hours: businessHoursSchema.optional(),
      timezone: z.string().min(1).optional(),
      auto_reply_enabled: z.boolean().optional(),
      auto_reply_body: z.string().max(2000).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Admins only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("messaging_settings")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ ...data, updated_at: new Date().toISOString() } as any)
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Hardcoded template defaults — used for the "Reset to default" button.
// Keep in sync with seeded values in notification_templates.
const TEMPLATE_DEFAULTS: Record<string, { sms_body?: string; email_subject?: string; email_body?: string }> = {
  appointment_confirmation: {
    sms_body:
      "Hi [First Name], your appointment at Faigy's Wig Salon is confirmed for [Day], [Date] at [Time]. See you soon! — Faigy's Wig Salon",
    email_subject: "Your appointment is confirmed",
  },
  appointment_reminder_24h: {
    sms_body:
      "Hi [First Name], just a reminder that you have an appointment tomorrow, [Date] at [Time] at Faigy's Wig Salon. — Faigy's Wig Salon",
    email_subject: "Appointment reminder — tomorrow",
  },
  appointment_reminder_2h: {
    sms_body:
      "Hi [First Name], your appointment at Faigy's Wig Salon is in 2 hours at [Time]. See you soon! — Faigy's Wig Salon",
    email_subject: "Appointment reminder — in 2 hours",
  },
  appointment_rescheduled: {
    sms_body:
      "Hi [First Name], your appointment has been rescheduled to [Day], [Date] at [Time] at Faigy's Wig Salon. — Faigy's Wig Salon",
    email_subject: "Your appointment was rescheduled",
  },
  appointment_cancelled: {
    sms_body:
      "Hi [First Name], your appointment on [Date] at [Time] at Faigy's Wig Salon has been cancelled. Please contact us to reschedule. — Faigy's Wig Salon",
    email_subject: "Your appointment was cancelled",
  },
  payment_received: {
    sms_body:
      "Hi [First Name], we received your payment of $[Amount] on [Date]. Thank you! — Faigy's Wig Salon",
    email_subject: "Payment received — thank you",
  },
  payment_receipt: {
    sms_body: "",
    email_subject: "Receipt from Faigy's Wig Salon",
  },
  outstanding_balance: {
    sms_body:
      "Hi [First Name], this is a friendly reminder that you have an outstanding balance of $[Amount] at Faigy's Wig Salon. Please contact us at your convenience. — Faigy's Wig Salon",
    email_subject: "Friendly balance reminder",
  },
  custom_order_arrived: {
    sms_body:
      "Hi [First Name], your custom wig order has arrived at Faigy's Wig Salon! We'll be reaching out shortly to schedule your fitting appointment. — Faigy's Wig Salon",
    email_subject: "Your custom order has arrived",
  },
  wash_set_dropoff: {
    sms_body:
      "Hi [First Name], we received your wig at Faigy's Wig Salon on [Date]. It will be washed, dried, and ready for your styling appointment on [Appointment Date]. — Faigy's Wig Salon",
    email_subject: "We received your wig",
  },
  wash_set_ready: {
    sms_body:
      "Hi [First Name], your wig has been washed and is all set for your styling appointment on [Date] at [Time]. See you then! — Faigy's Wig Salon",
    email_subject: "Your wig is washed and ready",
  },
};

export const resetTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Admins only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("notification_templates")
      .select("key")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Template not found");
    const defaults = TEMPLATE_DEFAULTS[row.key];
    if (!defaults) throw new Error("No default available for this template");
    const { error } = await supabaseAdmin
      .from("notification_templates")
      .update({
        sms_body: defaults.sms_body ?? "",
        email_subject: defaults.email_subject ?? "",
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
