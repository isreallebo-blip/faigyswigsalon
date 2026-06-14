import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// POST /api/intuit/tokenize-card
//
// IMPORTANT — PCI scope: This endpoint does NOT accept raw card numbers.
// Card data must be tokenized in the browser by POSTing directly to
// Intuit's /quickbooks/v4/payments/tokens endpoint. The browser then sends
// only the resulting opaque token here, where we vault it against the
// salon's QuickBooks company as a reusable cardOnFile.
//
// Body:
//   {
//     clientId: uuid,
//     cardToken: string,            // value returned by Intuit /tokens
//     cardholderName?: string,
//     customerEmail?: string,
//     cardBrand?: string,
//     last4?: "1234",
//     expMonth?: 12,
//     expYear?: 2030,
//     setDefault?: boolean
//   }

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

const InputSchema = z.object({
  clientId: z.string().uuid(),
  cardToken: z.string().min(8).max(2048),
  cardholderName: z.string().trim().max(200).optional().nullable(),
  customerEmail: z.string().trim().email().max(255).optional().nullable(),
  cardBrand: z.string().trim().max(40).optional().nullable(),
  last4: z.string().regex(/^\d{4}$/).optional().nullable(),
  expMonth: z.number().int().min(1).max(12).optional().nullable(),
  expYear: z.number().int().min(2000).max(9999).optional().nullable(),
  setDefault: z.boolean().optional(),
});

export const Route = createFileRoute("/api/intuit/tokenize-card")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { requireBearerStaff, paymentsFetch, getValidConnection } = await import("@/lib/intuit.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { userId } = await requireBearerStaff(request);
          const body = InputSchema.parse(await request.json());

          const conn = await getValidConnection();
          const vaulted = await paymentsFetch<{
            id: string;
            number?: string;
            expMonth?: string;
            expYear?: string;
            name?: string;
            cardType?: string;
          }>(`/quickbooks/v4/customers/${encodeURIComponent(conn.realm_id)}/cards/createFromToken`, {
            method: "POST",
            body: { value: body.cardToken },
          });

          const last4 =
            body.last4 ?? (vaulted.number ? vaulted.number.replace(/\D/g, "").slice(-4) : null);
          const brand = body.cardBrand ?? vaulted.cardType ?? null;
          const expMonth = body.expMonth ?? (vaulted.expMonth ? parseInt(vaulted.expMonth, 10) : null);
          const expYear = body.expYear ?? (vaulted.expYear ? parseInt(vaulted.expYear, 10) : null);

          if (body.setDefault) {
            await supabaseAdmin
              .from("payment_methods")
              .update({ is_default: false })
              .eq("client_id", body.clientId);
          }

          const { data: row, error } = await supabaseAdmin
            .from("payment_methods")
            .insert({
              client_id: body.clientId,
              intuit_customer_id: conn.realm_id,
              intuit_payment_method_id: vaulted.id,
              cardholder_name: body.cardholderName ?? vaulted.name ?? null,
              customer_email: body.customerEmail ?? null,
              card_brand: brand,
              last4,
              exp_month: expMonth,
              exp_year: expYear,
              is_default: !!body.setDefault,
              created_by: userId,
            })
            .select("*")
            .single();
          if (error) throw error;

          return new Response(JSON.stringify({ ok: true, paymentMethod: row }), {
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
