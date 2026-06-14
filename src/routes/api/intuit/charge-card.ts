import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// POST /api/intuit/charge-card
// Body: { paymentMethodId, amountCents, currency?, description?, capture? }

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

const InputSchema = z.object({
  paymentMethodId: z.string().uuid(),
  amountCents: z.number().int().positive().max(99_999_999),
  currency: z.string().length(3).default("USD"),
  description: z.string().trim().max(500).optional().nullable(),
  capture: z.boolean().default(true),
  turnstileToken: z.string().min(1, "CAPTCHA required"),
});

export const Route = createFileRoute("/api/intuit/charge-card")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { requireBearerStaff, paymentsFetch, verifyTurnstile } = await import("@/lib/intuit.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { userId } = await requireBearerStaff(request);
          const body = InputSchema.parse(await request.json());
          await verifyTurnstile(body.turnstileToken, request.headers.get("cf-connecting-ip"));

          const { data: pm, error: pmErr } = await supabaseAdmin
            .from("payment_methods")
            .select("id, client_id, intuit_payment_method_id")
            .eq("id", body.paymentMethodId)
            .maybeSingle();
          if (pmErr) throw pmErr;
          if (!pm) throw new Error("Saved card not found");

          const amount = (body.amountCents / 100).toFixed(2);

          try {
            const charge = await paymentsFetch<{
              id: string;
              status: string;
              authCode?: string;
            }>(`/quickbooks/v4/payments/charges`, {
              method: "POST",
              body: {
                cardOnFile: { id: pm.intuit_payment_method_id },
                amount,
                currency: body.currency,
                capture: body.capture,
                context: { mobile: "false", isEcommerce: "true" },
                ...(body.description ? { description: body.description } : {}),
              },
            });

            const { data: row, error } = await supabaseAdmin
              .from("payment_transactions")
              .insert({
                client_id: pm.client_id,
                payment_method_id: pm.id,
                amount_cents: body.amountCents,
                currency: body.currency,
                intuit_charge_id: charge.id,
                status: charge.status,
                description: body.description ?? null,
                created_by: userId,
              })
              .select("*")
              .single();
            if (error) throw error;
            return new Response(JSON.stringify({ ok: true, charge, transaction: row }), {
              status: 200,
              headers: JSON_HEADERS,
            });
          } catch (e) {
            await supabaseAdmin.from("payment_transactions").insert({
              client_id: pm.client_id,
              payment_method_id: pm.id,
              amount_cents: body.amountCents,
              currency: body.currency,
              status: "failed",
              description: body.description ?? null,
              error_message: e instanceof Error ? e.message : String(e),
              created_by: userId,
            });
            throw e;
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "error";
          const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 400;
          return new Response(JSON.stringify({ ok: false, error: msg }), { status, headers: JSON_HEADERS });
        }
      },
    },
  },
});
