import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "End-User License Agreement — Faigy's Wig Salon" },
      { name: "description", content: "Terms of use for Faigy's Wig Salon internal CRM and client portal." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4">
          &larr; Back to home
        </Link>
        <h1 className="mt-6 font-display text-4xl">End-User License Agreement</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: June 14, 2026</p>

        <div className="mt-10 space-y-8 text-sm leading-7 text-foreground">
          <section>
            <h2 className="font-semibold text-base">1. Acceptance of Terms</h2>
            <p className="mt-2 text-muted-foreground">
              By accessing or using the Faigy's Wig Salon internal CRM application (the "App"), you agree to be bound by this End-User License Agreement ("Agreement"). If you do not agree to these terms, you may not use the App.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base">2. Description of Service</h2>
            <p className="mt-2 text-muted-foreground">
              The App is an internal customer-relationship-management tool used exclusively by Faigy's Wig Salon staff for:
            </p>
            <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
              <li>Appointment scheduling and management</li>
              <li>Client recordkeeping and contact management</li>
              <li>Inventory and order tracking</li>
              <li>Payment processing through integrated third-party payment providers</li>
            </ul>
          </section>

          <section>
            <h2 className="font-semibold text-base">3. License Grant & Restrictions</h2>
            <p className="mt-2 text-muted-foreground">
              Faigy's Wig Salon grants you a limited, non-exclusive, non-transferable, revocable license to use the App solely for the internal business purposes of Faigy's Wig Salon. You may not:
            </p>
            <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
              <li>Copy, modify, distribute, sell, or lease any part of the App</li>
              <li>Reverse-engineer or attempt to extract the source code</li>
              <li>Use the App for any unlawful purpose or in violation of applicable laws</li>
              <li>Share your login credentials with any unauthorized person</li>
            </ul>
          </section>

          <section>
            <h2 className="font-semibold text-base">4. Payment Processing</h2>
            <p className="mt-2 text-muted-foreground">
              The App facilitates credit card payments via QuickBooks Payments. All payment transactions are subject to the terms and conditions of Intuit Inc. and the applicable card networks. Faigy's Wig Salon does not store full credit card numbers or CVV codes.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base">5. Termination</h2>
            <p className="mt-2 text-muted-foreground">
              Faigy's Wig Salon may suspend or terminate your access to the App at any time, with or without cause and with or without notice.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base">6. Disclaimer of Warranties</h2>
            <p className="mt-2 text-muted-foreground">
              The App is provided "as is" without warranties of any kind, either express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base">7. Limitation of Liability</h2>
            <p className="mt-2 text-muted-foreground">
              To the maximum extent permitted by law, Faigy's Wig Salon shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or relating to your use of the App.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base">8. Governing Law</h2>
            <p className="mt-2 text-muted-foreground">
              This Agreement shall be governed by and construed in accordance with the laws of the State of New York, without regard to its conflict-of-law principles.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base">9. Contact</h2>
            <p className="mt-2 text-muted-foreground">
              For questions about these terms, please contact Faigy's Wig Salon directly.
            </p>
          </section>
        </div>

        <div className="mt-12 border-t pt-6">
          <PublicFooter />
        </div>
      </div>
    </div>
  );
}

function PublicFooter() {
  return (
    <footer className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
      <span>© {new Date().getFullYear()} Faigy's Wig Salon. All rights reserved.</span>
      <div className="flex gap-4">
        <Link to="/terms" className="hover:text-foreground underline underline-offset-4">Terms</Link>
        <Link to="/privacy" className="hover:text-foreground underline underline-offset-4">Privacy</Link>
      </div>
    </footer>
  );
}
