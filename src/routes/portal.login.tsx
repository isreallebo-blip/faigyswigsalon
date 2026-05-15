import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/portal/login")({
  component: PortalLoginPage,
});

function PortalLoginPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"email" | "phone">("email");
  const [identifier, setIdentifier] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const send = async () => {
    const value = identifier.trim();
    if (!value) {
      toast.error("Please enter your " + (tab === "email" ? "email" : "phone number"));
      return;
    }
    setSubmitting(true);
    try {
      if (tab === "email") {
        const { error } = await supabase.auth.signInWithOtp({
          email: value,
          options: { data: { portal: true }, shouldCreateUser: true },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          phone: value,
          options: { data: { portal: true }, shouldCreateUser: true },
        });
        if (error) throw error;
      }
      toast.success("Verification code sent");
      navigate({
        to: "/portal/verify",
        search: { method: tab, identifier: value },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send code");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mt-8"
    >
      <h1 className="font-display text-3xl text-[oklch(0.22_0.02_60)]">Welcome</h1>
      <p className="mt-1 text-sm text-[oklch(0.45_0.02_60)]">
        Sign in to view your appointments, wigs, and payments.
      </p>

      <div className="mt-8 inline-flex rounded-full p-1 bg-[oklch(0.94_0.025_80)]">
        {(["email", "phone"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-5 py-1.5 text-xs uppercase tracking-wider font-medium rounded-full transition"
            style={{
              background: tab === t ? "oklch(0.99 0.01 80)" : "transparent",
              color: tab === t ? "oklch(0.20 0.01 60)" : "oklch(0.45 0.02 60)",
              boxShadow: tab === t ? "0 1px 2px oklch(0.2 0.02 60 / 0.08)" : "none",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        <label className="block text-xs uppercase tracking-wider text-[oklch(0.45_0.02_60)]">
          {tab === "email" ? "Email address" : "Phone number"}
        </label>
        <input
          autoFocus
          type={tab === "email" ? "email" : "tel"}
          inputMode={tab === "email" ? "email" : "tel"}
          autoComplete={tab === "email" ? "email" : "tel"}
          placeholder={tab === "email" ? "you@example.com" : "+1 555 555 5555"}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          className="w-full rounded-lg border border-[oklch(0.88_0.04_80)] bg-[oklch(0.99_0.01_80)] px-4 py-3 text-base text-[oklch(0.20_0.01_60)] outline-none focus:border-[oklch(0.65_0.13_75)]"
        />

        <button
          onClick={send}
          disabled={submitting}
          className="w-full rounded-lg py-3 font-medium tracking-wide transition"
          style={{
            background: "oklch(0.25 0.02 60)",
            color: "oklch(0.97 0.02 80)",
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? "Sending…" : "Send verification code"}
        </button>
      </div>

      <p className="mt-8 text-center text-xs text-[oklch(0.45_0.02_60)]">
        Salon staff?{" "}
        <Link to="/login" className="underline underline-offset-4 text-[oklch(0.55_0.13_75)]">
          Staff sign-in
        </Link>
      </p>
    </motion.div>
  );
}
