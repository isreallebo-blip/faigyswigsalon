import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

// Returns the caller IP based on common proxy headers, used by the client-side
// audit helper to enrich log entries.
export const getClientIp = createServerFn({ method: "GET" }).handler(async () => {
  const fwd =
    getRequestHeader("cf-connecting-ip") ||
    getRequestHeader("x-real-ip") ||
    getRequestHeader("x-forwarded-for");
  if (fwd) return { ip: fwd.split(",")[0].trim() };
  try {
    return { ip: getRequestIP({ xForwardedFor: true }) ?? null };
  } catch {
    return { ip: null };
  }
});
