// Client-side helper that wraps the triggerNotification serverFn and provides
// pure variable formatters that don't require importing server-only modules.
import { triggerNotification } from "@/lib/notifications/notifications.functions";

export const triggerNotificationFn = triggerNotification;

export function appointmentVarsClient(d: Date, type?: string | null) {
  const day = d.toLocaleDateString("en-US", { weekday: "long" });
  const date = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return { day, date, time, appointmentType: type ?? "", appointmentDate: date };
}

export function formatDateClient(d: Date | string | null | undefined) {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}
