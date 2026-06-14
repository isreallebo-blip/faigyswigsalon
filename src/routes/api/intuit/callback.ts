import { createFileRoute, redirect } from "@tanstack/react-router";

// Intuit redirects here with ?code=...&realmId=...&state=...
// We verify the signed state, exchange the code for tokens, and persist the
// connection. Then we bounce back to the settings page with a status flag.

export const Route = createFileRoute("/api/intuit/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const realmId = url.searchParams.get("realmId");
        const state = url.searchParams.get("state") ?? "";
        const error = url.searchParams.get("error");

        if (error) {
          throw redirect({ to: "/settings/quickbooks", search: { status: "error", reason: error } });
        }
        if (!code || !realmId) {
          return new Response("Missing code or realmId from Intuit.", { status: 400 });
        }

        const { verifyState, exchangeAuthorizationCode, upsertConnection, getIntuitEnv } =
          await import("@/lib/intuit.server");
        const payload = verifyState(state);
        if (!payload) {
          return new Response("Invalid or expired OAuth state.", { status: 400 });
        }

        try {
          const tokens = await exchangeAuthorizationCode(code);
          await upsertConnection({
            realmId,
            environment: getIntuitEnv(),
            tokens,
            connectedBy: payload.uid,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          throw redirect({ to: "/settings/quickbooks", search: { status: "error", reason: msg.slice(0, 200) } });
        }

        throw redirect({ to: "/settings/quickbooks", search: { status: "connected" } });
      },
    },
  },
});
