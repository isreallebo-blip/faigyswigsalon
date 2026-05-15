import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/appointments")({
  head: () => ({ meta: [{ title: "Appointments — Faigy's Wig Salon" }] }),
  component: () => <ComingSoon title="Appointments" blurb="Day, week, and month calendar with SMS reminders 24h and 2h before." />,
});
