import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Admins only");
}

export const getIntuitStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data } = await supabaseAdmin
      .from("intuit_connections")
      .select("realm_id, environment, access_token_expires_at, refresh_token_expires_at, connected_by, created_at, updated_at")
      .eq("provider", "intuit_payments")
      .maybeSingle();
    return {
      connected: !!data,
      realmId: data?.realm_id ?? null,
      environment: data?.environment ?? (process.env.INTUIT_ENVIRONMENT ?? "sandbox"),
      accessTokenExpiresAt: data?.access_token_expires_at ?? null,
      refreshTokenExpiresAt: data?.refresh_token_expires_at ?? null,
      connectedBy: data?.connected_by ?? null,
      updatedAt: data?.updated_at ?? null,
    };
  });

export const getIntuitAuthorizeUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { signState, buildAuthorizeUrl } = await import("@/lib/intuit.server");
    const state = signState(context.userId);
    // Both the direct Intuit URL and the spec-required /api/intuit/connect
    // wrapper are returned. The UI uses `connectUrl`.
    return {
      authorizeUrl: buildAuthorizeUrl(state),
      connectUrl: `/api/intuit/connect?s=${encodeURIComponent(state)}`,
    };
  });

export const disconnectIntuit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { loadConnection, revokeToken, deleteConnection } = await import("@/lib/intuit.server");
    const conn = await loadConnection();
    if (conn) await revokeToken(conn.refresh_token);
    await deleteConnection();
    return { ok: true };
  });

export const refreshIntuitToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { forceRefreshConnection } = await import("@/lib/intuit.server");
    const conn = await forceRefreshConnection();
    return { ok: true, accessTokenExpiresAt: conn.access_token_expires_at };
  });

// Hits a real Payments endpoint (POST /tokens with dummy sandbox card) to
// confirm OAuth/realm/environment are valid end-to-end. The token endpoint
// is the safest "ping" because it doesn't require a known charge ID.
export const testIntuitConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { getValidConnection, getPaymentsBaseUrl } = await import("@/lib/intuit.server");
    const conn = await getValidConnection();
    const res = await fetch(`${getPaymentsBaseUrl(conn.environment)}/quickbooks/v4/payments/tokens`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${conn.access_token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "request-Id": crypto.randomUUID(),
      },
      body: JSON.stringify({
        card: {
          number: "4112344112344113",
          expMonth: "12",
          expYear: String(new Date().getFullYear() + 2),
          cvc: "123",
          name: "Connection Test",
          address: { streetAddress: "1 Test St", city: "Mountain View", region: "CA", postalCode: "94043", country: "US" },
        },
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Test failed (${res.status}): ${txt.slice(0, 400)}`);
    }
    const json = (await res.json()) as { value?: string };
    return { ok: true, gotToken: !!json.value, realmId: conn.realm_id, environment: conn.environment };
  });

// ---- Saved cards / charges / refunds (callable from the staff UI) ----

// Turnstile site key for the browser widget. Publishable, server-fetched
// because Lovable does not let us write `VITE_TURNSTILE_*` runtime secrets.
export const getTurnstilePublicConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { getTurnstileSiteKey } = await import("@/lib/intuit.server");
  return { siteKey: getTurnstileSiteKey() };
});

const SaveTokenInput = z.object({
  clientId: z.string().uuid(),
  cardToken: z.string().min(8).max(2048),
  turnstileToken: z.string().min(1, "CAPTCHA required"),
  cardholderName: z.string().trim().max(200).optional().nullable(),
  customerEmail: z.string().trim().email().max(255).optional().nullable(),
  cardBrand: z.string().trim().max(40).optional().nullable(),
  last4: z.string().regex(/^\d{4}$/).optional().nullable(),
  expMonth: z.number().int().min(1).max(12).optional().nullable(),
  expYear: z.number().int().min(2000).max(9999).optional().nullable(),
  setDefault: z.boolean().optional(),
});

export const saveTokenizedCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SaveTokenInput.parse(d))
  .handler(async ({ data, context }) => {
    const { paymentsFetch, getValidConnection, verifyTurnstile } = await import("@/lib/intuit.server");
    await verifyTurnstile(data.turnstileToken);
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
      body: { value: data.cardToken },
    });

    const last4 =
      data.last4 ??
      (vaulted.number ? vaulted.number.slice(-4).replace(/\D/g, "").padStart(4, "0") : null);
    const brand = data.cardBrand ?? vaulted.cardType ?? null;
    const expMonth = data.expMonth ?? (vaulted.expMonth ? parseInt(vaulted.expMonth, 10) : null);
    const expYear = data.expYear ?? (vaulted.expYear ? parseInt(vaulted.expYear, 10) : null);

    if (data.setDefault) {
      await supabaseAdmin
        .from("payment_methods")
        .update({ is_default: false })
        .eq("client_id", data.clientId);
    }

    const { data: row, error } = await supabaseAdmin
      .from("payment_methods")
      .insert({
        client_id: data.clientId,
        intuit_customer_id: conn.realm_id,
        intuit_payment_method_id: vaulted.id,
        cardholder_name: data.cardholderName ?? vaulted.name ?? null,
        customer_email: data.customerEmail ?? null,
        card_brand: brand,
        last4,
        exp_month: expMonth,
        exp_year: expYear,
        is_default: !!data.setDefault,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

const ChargeInput = z.object({
  paymentMethodId: z.string().uuid(),
  amountCents: z.number().int().positive().max(99_999_999),
  currency: z.string().length(3).default("USD"),
  description: z.string().trim().max(500).optional().nullable(),
  capture: z.boolean().default(true),
  turnstileToken: z.string().min(1, "CAPTCHA required"),
  deviceId: z.string().trim().min(1).max(128).optional().nullable(),
  userAgent: z.string().trim().max(512).optional().nullable(),
});

export const chargeCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ChargeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { paymentsFetchWithMeta, verifyTurnstile, buildPaymentContextFromServerFn, IntuitApiError } = await import("@/lib/intuit.server");
    await verifyTurnstile(data.turnstileToken);
    const { data: pm, error: pmErr } = await supabaseAdmin
      .from("payment_methods")
      .select("id, client_id, intuit_payment_method_id, last4, card_brand")
      .eq("id", data.paymentMethodId)
      .maybeSingle();
    if (pmErr) throw pmErr;
    if (!pm) throw new Error("Saved card not found");

    const amount = (data.amountCents / 100).toFixed(2);
    const paymentContext = buildPaymentContextFromServerFn(data.deviceId ?? null, data.userAgent ?? null);
    try {
      const { data: charge, meta } = await paymentsFetchWithMeta<{
        id: string;
        status: string;
        amount: string;
        currency: string;
        authCode?: string;
      }>(`/quickbooks/v4/payments/charges`, {
        method: "POST",
        body: {
          cardOnFile: { id: pm.intuit_payment_method_id },
          amount,
          currency: data.currency,
          capture: data.capture,
          context: paymentContext,
          ...(data.description ? { description: data.description } : {}),
        },
      });

      const { data: row, error } = await supabaseAdmin
        .from("payment_transactions")
        .insert({
          client_id: pm.client_id,
          payment_method_id: pm.id,
          amount_cents: data.amountCents,
          currency: data.currency,
          intuit_charge_id: charge.id,
          intuit_tid: meta.intuitTid,
          status: charge.status,
          description: data.description ?? null,
          created_by: context.userId,
          salon_name: "Faigy's Wig Salon",
        })
        .select("*")
        .single();
      if (error) throw error;
      return { ok: true, charge, transaction: row, intuitTid: meta.intuitTid };
    } catch (e) {
      const tid = e instanceof IntuitApiError ? e.intuitTid : null;
      await supabaseAdmin.from("payment_transactions").insert({
        client_id: pm.client_id,
        payment_method_id: pm.id,
        amount_cents: data.amountCents,
        currency: data.currency,
        status: "failed",
        intuit_tid: tid,
        description: data.description ?? null,
        error_message: e instanceof Error ? e.message : String(e),
        created_by: context.userId,
      });
      throw e;
    }
  });

const RefundInput = z.object({
  transactionId: z.string().uuid(),
  amountCents: z.number().int().positive().max(99_999_999).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  turnstileToken: z.string().min(1, "CAPTCHA required"),
  deviceId: z.string().trim().min(1).max(128).optional().nullable(),
  userAgent: z.string().trim().max(512).optional().nullable(),
});

export const refundCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RefundInput.parse(d))
  .handler(async ({ data, context: _context }) => {
    void _context;
    const { paymentsFetchWithMeta, verifyTurnstile, buildPaymentContextFromServerFn } = await import("@/lib/intuit.server");
    await verifyTurnstile(data.turnstileToken);
    const { data: tx, error: txErr } = await supabaseAdmin
      .from("payment_transactions")
      .select("id, amount_cents, refunded_amount_cents, intuit_charge_id")
      .eq("id", data.transactionId)
      .maybeSingle();
    if (txErr) throw txErr;
    if (!tx?.intuit_charge_id) throw new Error("Transaction has no charge to refund");

    const refundCents = data.amountCents ?? tx.amount_cents - tx.refunded_amount_cents;
    if (refundCents <= 0) throw new Error("Nothing left to refund");
    const amount = (refundCents / 100).toFixed(2);
    const paymentContext = buildPaymentContextFromServerFn(data.deviceId ?? null, data.userAgent ?? null);

    const { data: refund, meta } = await paymentsFetchWithMeta<{ id: string; amount: string; created: string }>(
      `/quickbooks/v4/payments/charges/${encodeURIComponent(tx.intuit_charge_id)}/refunds`,
      {
        method: "POST",
        body: {
          amount,
          description: data.description ?? "Refund",
          context: paymentContext,
        },
      },
    );

    const newRefunded = tx.refunded_amount_cents + refundCents;
    const newStatus = newRefunded >= tx.amount_cents ? "refunded" : "partially_refunded";
    const { error } = await supabaseAdmin
      .from("payment_transactions")
      .update({
        intuit_refund_id: refund.id,
        intuit_tid: meta.intuitTid,
        refunded_amount_cents: newRefunded,
        status: newStatus,
      })
      .eq("id", tx.id);
    if (error) throw error;
    return { ok: true, refund, intuitTid: meta.intuitTid };
  });

export const listClientPaymentMethods = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin
      .from("payment_methods")
      .select("*")
      .eq("client_id", data.clientId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const listClientTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin
      .from("payment_transactions")
      .select("*")
      .eq("client_id", data.clientId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

// ---- Receipts ----
//
// `getReceiptByToken` is intentionally public (no auth middleware): the
// receipt URL contains a non-guessable UUID token sent only to the customer.
// We project only safe display fields — never the Intuit charge/refund IDs.

export const getReceiptByToken = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: tx, error } = await supabaseAdmin
      .from("payment_transactions")
      .select(
        "id, created_at, amount_cents, currency, status, description, refunded_amount_cents, salon_name, salon_address, salon_phone, payment_method_id, client_id",
      )
      .eq("receipt_token", data.token)
      .maybeSingle();
    if (error) throw error;
    if (!tx) return null;
    const [{ data: pm }, { data: client }] = await Promise.all([
      tx.payment_method_id
        ? supabaseAdmin
            .from("payment_methods")
            .select("card_brand, last4")
            .eq("id", tx.payment_method_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      tx.client_id
        ? supabaseAdmin
            .from("clients")
            .select("full_name")
            .eq("id", tx.client_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    return {
      id: tx.id,
      createdAt: tx.created_at,
      amountCents: tx.amount_cents,
      currency: tx.currency,
      status: tx.status,
      description: tx.description,
      refundedCents: tx.refunded_amount_cents,
      salonName: tx.salon_name ?? "Faigy's Wig Salon",
      salonAddress: tx.salon_address,
      salonPhone: tx.salon_phone,
      cardBrand: pm?.card_brand ?? null,
      last4: pm?.last4 ?? null,
      clientName: client?.full_name ?? null,
    };
  });

export const emailPaymentReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        transactionId: z.string().uuid(),
        email: z.string().trim().email().max(255),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { data: tx, error } = await supabaseAdmin
      .from("payment_transactions")
      .select(
        "id, created_at, amount_cents, currency, status, description, client_id, receipt_token, salon_name",
      )
      .eq("id", data.transactionId)
      .maybeSingle();
    if (error) throw error;
    if (!tx) throw new Error("Transaction not found");
    if (!tx.client_id) throw new Error("Transaction has no client");

    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("full_name, display_id")
      .eq("id", tx.client_id)
      .maybeSingle();

    const amountStr = `$${(tx.amount_cents / 100).toFixed(2)}`;
    const dateStr = new Date(tx.created_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const origin =
      process.env.APP_PUBLIC_ORIGIN ??
      `https://${process.env.VITE_PROJECT_DOMAIN ?? "faigyswigsalon.com"}`;
    const receiptLink = `${origin}/receipt/${tx.receipt_token}`;

    const { sendNotification } = await import("@/lib/notifications/send.server");
    const result = await sendNotification({
      clientId: tx.client_id,
      templateKey: "payment_receipt",
      idempotencyKey: `card-receipt-${tx.id}`,
      receiptData: {
        clientName: client?.full_name ?? "",
        cltId: client?.display_id ?? "",
        date: dateStr,
        hebrewDate: "",
        amount: amountStr,
        method: "Credit card",
        description: tx.description ?? `View full receipt: ${receiptLink}`,
      },
    }).catch((e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }));

    await supabaseAdmin
      .from("payment_transactions")
      .update({ receipt_email: data.email, receipt_sent_at: new Date().toISOString() })
      .eq("id", tx.id);

    return { ok: true, receiptLink, notification: result };
  });

export const listRecentCharges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("payment_transactions")
      .select(
        "id, created_at, amount_cents, currency, status, description, receipt_token, receipt_sent_at, receipt_email, client_id, payment_method_id, refunded_amount_cents",
      )
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) throw error;
    return data ?? [];
  });

