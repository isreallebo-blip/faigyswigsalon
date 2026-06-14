import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Faigy's Wig Salon" },
      { name: "description", content: "Privacy policy for Faigy's Wig Salon CRM and client portal." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4">
          &larr; Back to home
        </Link>
        <h1 className="mt-6 font-display text-4xl">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: June 14, 2026</p>

        <div className="mt-10 space-y-8 text-sm leading-7 text-foreground">
          <section>
            <h2 className="font-semibold text-base">1. Introduction</h2>
            <p className="mt-2 text-muted-foreground">
              Faigy's Wig Salon ("we," "us," or "our") respects your privacy. This Privacy Policy explains how we collect, use, store, and protect your information when you use our internal CRM application and client portal.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base">2. Information We Collect</h2>
            <p className="mt-2 text-muted-foreground">
              We collect the following categories of information to provide our services:
            </p>
            <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
              <li><strong>Customer contact information:</strong> Name, email address, phone number, and mailing address.</li>
              <li><strong>Appointment details:</strong> Dates, times, services requested, stylist assignments, and visit notes.</li>
              <li><strong>Inventory and order information:</strong> Products, wig styles, measurements, purchase history, and order status.</li>
              <li><strong>Payment-related information:</strong> Transaction amounts, payment dates, and payment method references. We <strong>do not</strong> store full credit card numbers or CVV codes.</li>
              <li><strong>Account information:</strong> Login credentials and profile preferences for staff and client portal users.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-semibold text-base">3. How We Use Your Information</h2>
            <p className="mt-2 text-muted-foreground">
              We use the information we collect to:
            </p>
            <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
              <li>Schedule and manage appointments</li>
              <li>Maintain accurate client and inventory records</li>
              <li>Process payments and issue refunds</li>
              <li>Communicate with you about your appointments, orders, and account</li>
              <li>Improve our services and internal operations</li>
            </ul>
          </section>

          <section>
            <h2 className="font-semibold text-base">4. Payment Data Security</h2>
            <p className="mt-2 text-muted-foreground">
              All credit card payments are processed through <strong>QuickBooks Payments</strong> by Intuit Inc. We never store full credit card numbers or CVV codes on our servers. When you provide card information, it is tokenized by QuickBooks Payments and we store only a secure payment method token and non-sensitive metadata (last four digits, card brand, expiration date) for your convenience.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base">5. Data Sharing & Disclosure</h2>
            <p className="mt-2 text-muted-foreground">
              We do not sell your personal information. We may share information with:
            </p>
            <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
              <li><strong>Service providers:</strong> QuickBooks Payments for payment processing, and our hosting/infrastructure providers.</li>
              <li><strong>Legal compliance:</strong> When required by law, subpoena, or court order.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-semibold text-base">6. Data Retention</h2>
            <p className="mt-2 text-muted-foreground">
              We retain your information for as long as necessary to fulfill the purposes for which it was collected, comply with legal obligations, resolve disputes, and enforce our agreements.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base">7. Your Rights</h2>
            <p className="mt-2 text-muted-foreground">
              Depending on your location, you may have rights to access, correct, delete, or restrict the use of your personal information. To exercise these rights, please contact us directly.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base">8. Security</h2>
            <p className="mt-2 text-muted-foreground">
              We implement appropriate technical and organizational measures to protect your information against unauthorized access, alteration, disclosure, or destruction. All data is encrypted in transit and at rest.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base">9. Changes to This Policy</h2>
            <p className="mt-2 text-muted-foreground">
              We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the updated policy in the App.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base">10. Contact Us</h2>
            <p className="mt-2 text-muted-foreground">
              If you have any questions or concerns about this Privacy Policy or our data practices, please contact Faigy's Wig Salon directly.
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
