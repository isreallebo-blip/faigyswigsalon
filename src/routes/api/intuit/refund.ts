import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// POST /api/intuit/refund
// Body: { transactionId, amountCents?, description? }
// If amountCents is omitted, refunds the remaining unrefunded balance.

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

const InputSchema = z.object({
  transactionId: z.string().uuid(),
  amountCents: z.number().int().positive().max(99_999_999).optional(),
  description: z.string().trim().max(500).optional().nullable(),
});

export const Route = createFileRoute("/api/intuit/refund")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { requireBearerStaff, paymentsFetch } = await import("@/lib/intuit.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await requireBearerStaff(request);
          const body = InputSchema.parse(await request.json());

          const { data: tx, error: txErr } = await supabaseAdmin
            .from("payment_transactions")
            .select("id, amount_cents, refunded_amount_cents, intuit_charge_id")
            .eq("id", body.transactionId)
            .maybeSingle();
          if (txErr) throw txErr;
          if (!tx?.intuit_charge_id) throw new Error("Transaction has no charge to refund");

          const refundCents =
            body.amountCents ?? tx.amount_cents - tx.refunded_amount_cents;
          if (refundCents <= 0) throw new Error("Nothing left to refund");
          const amount = (refundCents / 100).toFixed(2);

          const refund = await paymentsFetch<{ id: string; amount: string }>(
            `/quickbooks/v4/payments/charges/${encodeURIComponent(tx.intuit_charge_id)}/refunds`,
            {
              method: "POST",
              body: {
                amount,
                description: body.description ?? "Refund",
                context: { mobile: "false", isEcommerce: "true" },
              },
            },
          );

          const newRefunded = tx.refunded_amount_cents + refundCents;
          const newStatus = newRefunded >= tx.amount_cents ? "refunded" : "partially_refunded";
          const { error } = await supabaseAdmin
            .from("payment_transactions")
            .update({
              intuit_refund_id: refund.id,
              refunded_amount_cents: newRefunded,
              status: newStatus,
            })
            .eq("id", tx.id);
          if (error) throw error;

          return new Response(JSON.stringify({ ok: true, refund }), {
            status: 200,
            headers: JSON_HEADERS,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "error";
          const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 400;
          return new Response(JSON.stringify({ ok: false, error: msg }), { status, headers: JSON_HEADERS });
        }
      },
    },
  },
});
