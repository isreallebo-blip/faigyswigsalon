import { createFileRoute, redirect } from "@tanstack/react-router";

// Redirects the admin to Intuit's OAuth consent screen.
// The `s` query parameter is a short-lived HMAC-signed token issued by the
// admin-only server function `getIntuitAuthorizeUrl`. This prevents random
// visitors from initiating an OAuth flow that would attach their personal
// QuickBooks account to the salon.

export const Route = createFileRoute("/api/intuit/connect")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const state = url.searchParams.get("s") ?? "";
        const { verifyState, buildAuthorizeUrl } = await import("@/lib/intuit.server");
        const payload = verifyState(state);
        if (!payload) {
          return new Response("Invalid or expired connect token. Click 'Connect QuickBooks Payments' again from Settings.", { status: 400 });
        }
        throw redirect({ href: buildAuthorizeUrl(state) });
      },
    },
  },
});
