import { createFileRoute } from "@tanstack/react-router";

// POST /api/intuit/refresh-token
// Requires an Authorization: Bearer <supabase access_token> header from an admin.

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

export const Route = createFileRoute("/api/intuit/refresh-token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { requireBearerAdmin, forceRefreshConnection } = await import("@/lib/intuit.server");
          await requireBearerAdmin(request);
          const conn = await forceRefreshConnection();
          return new Response(
            JSON.stringify({
              ok: true,
              accessTokenExpiresAt: conn.access_token_expires_at,
              realmId: conn.realm_id,
            }),
            { status: 200, headers: JSON_HEADERS },
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : "error";
          const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
          return new Response(JSON.stringify({ ok: false, error: msg }), { status, headers: JSON_HEADERS });
        }
      },
    },
  },
});
