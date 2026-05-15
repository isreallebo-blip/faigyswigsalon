import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({ meta: [{ title: "Payments — Maison" }] }),
  component: () => <ComingSoon title="Payments & bank register" blurb="Running ledger, bank reconciliation, and credit-card processor matching." />,
});
