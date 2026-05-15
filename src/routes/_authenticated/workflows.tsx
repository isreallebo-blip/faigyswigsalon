import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/workflows")({
  head: () => ({ meta: [{ title: "Service workflows — Faigy's Wig Salon" }] }),
  component: () => <ComingSoon title="Service workflows" blurb="Step-by-step tracking for Sale + Cut and Wash & Set service journeys." />,
});
