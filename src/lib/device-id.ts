// Browser-side persistent device identifier used to populate
// `context.deviceInfo.id` on Intuit Payments Charge / Refund API requests.
//
// Intuit's Payments API recommends sending a stable per-browser identifier
// in `context.deviceInfo.id` so their risk engine can correlate
// card-not-present activity across sessions. The value is opaque, contains
// no PII, and is stored in localStorage under `intuit_device_id`.

const STORAGE_KEY = "intuit_device_id";

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return "";
  try {
    let v = localStorage.getItem(STORAGE_KEY);
    if (!v) {
      v = randomId();
      localStorage.setItem(STORAGE_KEY, v);
    }
    return v;
  } catch {
    return "";
  }
}
