// SERVER-ONLY: Intuit / QuickBooks Payments helpers.
// Never import this file from client code.

import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const INTUIT_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
export const INTUIT_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
export const INTUIT_REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";

const PAYMENTS_BASE = {
  sandbox: "https://sandbox.api.intuit.com",
  production: "https://api.intuit.com",
} as const;

export type IntuitEnv = "sandbox" | "production";

export function getIntuitEnv(): IntuitEnv {
  const v = (process.env.INTUIT_ENVIRONMENT ?? "sandbox").toLowerCase();
  return v === "production" ? "production" : "sandbox";
}

export function getPaymentsBaseUrl(env: IntuitEnv = getIntuitEnv()): string {
  return PAYMENTS_BASE[env];
}

export function getIntuitScope(): string {
  return process.env.INTUIT_SCOPES?.trim() || "com.intuit.quickbooks.payment";
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function base64url(input: Buffer | string): string {
  const b = typeof input === "string" ? Buffer.from(input) : input;
  return b.toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function fromBase64url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

// ---- Signed OAuth state (also acts as a one-shot admin token for /connect) ----

interface StatePayload {
  uid: string;        // admin user id who initiated
  exp: number;        // ms epoch
  nonce: string;
}

export function signState(userId: string, ttlMs = 10 * 60_000): string {
  const payload: StatePayload = {
    uid: userId,
    exp: Date.now() + ttlMs,
    nonce: randomBytes(8).toString("hex"),
  };
  const body = base64url(JSON.stringify(payload));
  const sig = createHmac("sha256", requireEnv("INTUIT_CLIENT_SECRET")).update(body).digest();
  return `${body}.${base64url(sig)}`;
}

export function verifyState(token: string): StatePayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", requireEnv("INTUIT_CLIENT_SECRET")).update(body).digest();
  const given = fromBase64url(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(fromBase64url(body).toString("utf8")) as StatePayload;
    if (!payload?.uid || typeof payload.exp !== "number") return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---- Authorize URL ----

export function buildAuthorizeUrl(stateToken: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("INTUIT_CLIENT_ID"),
    response_type: "code",
    scope: getIntuitScope(),
    redirect_uri: requireEnv("INTUIT_REDIRECT_URI"),
    state: stateToken,
  });
  return `${INTUIT_AUTH_URL}?${params.toString()}`;
}

// ---- Token exchange / refresh ----

interface TokenResponse {
  token_type: string;
  access_token: string;
  expires_in: number;
  refresh_token: string;
  x_refresh_token_expires_in?: number;
}

function basicAuth(): string {
  const id = requireEnv("INTUIT_CLIENT_ID");
  const secret = requireEnv("INTUIT_CLIENT_SECRET");
  return Buffer.from(`${id}:${secret}`).toString("base64");
}

export async function exchangeAuthorizationCode(code: string): Promise<TokenResponse> {
  const res = await fetch(INTUIT_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: requireEnv("INTUIT_REDIRECT_URI"),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Intuit token exchange failed (${res.status}): ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

async function refreshTokenRequest(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(INTUIT_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Intuit token refresh failed (${res.status}): ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(INTUIT_REVOKE_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token }),
  }).catch(() => {});
}

// ---- DB-backed connection helpers ----

export interface IntuitConnection {
  id: string;
  realm_id: string;
  environment: IntuitEnv;
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string;
}

export async function loadConnection(): Promise<IntuitConnection | null> {
  const { data, error } = await supabaseAdmin
    .from("intuit_connections")
    .select("id, realm_id, environment, access_token, refresh_token, access_token_expires_at")
    .eq("provider", "intuit_payments")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    environment: (data.environment as IntuitEnv) ?? "sandbox",
  };
}

export async function upsertConnection(input: {
  realmId: string;
  environment: IntuitEnv;
  tokens: TokenResponse;
  connectedBy: string;
}): Promise<void> {
  const now = Date.now();
  const accessExpires = new Date(now + input.tokens.expires_in * 1000).toISOString();
  const refreshExpires = input.tokens.x_refresh_token_expires_in
    ? new Date(now + input.tokens.x_refresh_token_expires_in * 1000).toISOString()
    : null;

  const { error } = await supabaseAdmin.from("intuit_connections").upsert(
    {
      provider: "intuit_payments",
      environment: input.environment,
      realm_id: input.realmId,
      access_token: input.tokens.access_token,
      refresh_token: input.tokens.refresh_token,
      token_type: input.tokens.token_type ?? "Bearer",
      scope: getIntuitScope(),
      access_token_expires_at: accessExpires,
      refresh_token_expires_at: refreshExpires,
      connected_by: input.connectedBy,
    },
    { onConflict: "provider" },
  );
  if (error) throw error;
}

export async function deleteConnection(): Promise<void> {
  await supabaseAdmin.from("intuit_connections").delete().eq("provider", "intuit_payments");
}

// Returns a valid access token, refreshing automatically if expired or about to expire.
export async function getValidConnection(): Promise<IntuitConnection> {
  const conn = await loadConnection();
  if (!conn) throw new Error("QuickBooks Payments is not connected.");

  const expiresAt = new Date(conn.access_token_expires_at).getTime();
  const skewMs = 60_000; // refresh 1 min before expiry
  if (Date.now() < expiresAt - skewMs) return conn;

  const tokens = await refreshTokenRequest(conn.refresh_token);
  const now = Date.now();
  const accessExpires = new Date(now + tokens.expires_in * 1000).toISOString();
  const refreshExpires = tokens.x_refresh_token_expires_in
    ? new Date(now + tokens.x_refresh_token_expires_in * 1000).toISOString()
    : null;

  const { error } = await supabaseAdmin
    .from("intuit_connections")
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      access_token_expires_at: accessExpires,
      refresh_token_expires_at: refreshExpires,
    })
    .eq("id", conn.id);
  if (error) throw error;

  return { ...conn, access_token: tokens.access_token, refresh_token: tokens.refresh_token, access_token_expires_at: accessExpires };
}

export async function forceRefreshConnection(): Promise<IntuitConnection> {
  const conn = await loadConnection();
  if (!conn) throw new Error("QuickBooks Payments is not connected.");
  const tokens = await refreshTokenRequest(conn.refresh_token);
  const now = Date.now();
  const accessExpires = new Date(now + tokens.expires_in * 1000).toISOString();
  const refreshExpires = tokens.x_refresh_token_expires_in
    ? new Date(now + tokens.x_refresh_token_expires_in * 1000).toISOString()
    : null;
  const { error } = await supabaseAdmin
    .from("intuit_connections")
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      access_token_expires_at: accessExpires,
      refresh_token_expires_at: refreshExpires,
    })
    .eq("id", conn.id);
  if (error) throw error;
  return { ...conn, access_token: tokens.access_token, refresh_token: tokens.refresh_token, access_token_expires_at: accessExpires };
}

// ---- Authenticated Payments API requests ----

function newRequestId(): string {
  // request-Id is the Payments idempotency mechanism; must be unique per request.
  return crypto.randomUUID();
}

export async function paymentsFetch<T = unknown>(
  path: string,
  init: { method?: "GET" | "POST" | "DELETE"; body?: unknown; requestId?: string } = {},
): Promise<T> {
  const conn = await getValidConnection();
  const url = `${getPaymentsBaseUrl(conn.environment)}${path}`;
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "request-Id": init.requestId ?? newRequestId(),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    const message =
      (parsed && typeof parsed === "object" && "errors" in parsed
        ? JSON.stringify((parsed as { errors: unknown }).errors)
        : null) ?? text ?? `HTTP ${res.status}`;
    throw new Error(`Intuit Payments ${res.status}: ${message}`);
  }
  return parsed as T;
}

// ---- Role check helper for HTTP routes that aren't backed by serverFn middleware ----

export async function requireBearerStaff(request: Request): Promise<{ userId: string; isAdmin: boolean }> {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = auth.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("Unauthorized");
  const userId = data.user.id;
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const roleNames = (roles ?? []).map((r) => r.role as "admin" | "staff");
  if (roleNames.length === 0) throw new Error("Forbidden");
  return { userId, isAdmin: roleNames.includes("admin") };
}

export async function requireBearerAdmin(request: Request): Promise<{ userId: string }> {
  const { userId, isAdmin } = await requireBearerStaff(request);
  if (!isAdmin) throw new Error("Forbidden");
  return { userId };
}
