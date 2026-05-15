import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({ meta: [{ title: "Inventory — Faigy's Wig Salon" }] }),
  component: () => <ComingSoon title="Inventory" blurb="Wig catalog with status, reservations, and custom orders to your vendors." />,
});
