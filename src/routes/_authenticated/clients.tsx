import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/clients")({
  head: () => ({ meta: [{ title: "Clients — Faigy's Wig Salon" }] }),
  component: () => <ComingSoon title="Clients" blurb="Profiles, measurements, photos, tags, and a full activity timeline per client." />,
});
