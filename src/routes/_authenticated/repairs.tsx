import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/repairs")({
  head: () => ({ meta: [{ title: "Repairs — Faigy's Wig Salon" }] }),
  component: () => <ComingSoon title="Repair tracking" blurb="Every repair job, vendor, cost, and return date — linked to client and workflow." />,
});
