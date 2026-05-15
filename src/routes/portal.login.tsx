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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Enter your email and password");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      toast.success("Welcome back");
      navigate({ to: "/portal" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  };

  const forgot = async () => {
    if (!email.trim()) {
      toast.error("Enter your email first");
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Password reset email sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send reset email");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mt-8"
    >
      <h1 className="font-display text-3xl text-[oklch(0.22_0.02_60)]">Welcome back</h1>
      <p className="mt-1 text-sm text-[oklch(0.45_0.02_60)]">
        Sign in to view your appointments, wigs, and payments.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-3">
        <label className="block text-xs uppercase tracking-wider text-[oklch(0.45_0.02_60)]">
          Email
        </label>
        <input
          autoFocus
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-[oklch(0.88_0.04_80)] bg-[oklch(0.99_0.01_80)] px-4 py-3 text-base text-[oklch(0.20_0.01_60)] outline-none focus:border-[oklch(0.65_0.13_75)]"
        />

        <div className="flex items-center justify-between pt-2">
          <label className="block text-xs uppercase tracking-wider text-[oklch(0.45_0.02_60)]">
            Password
          </label>
          <button
            type="button"
            onClick={forgot}
            className="text-xs text-[oklch(0.55_0.13_75)] underline-offset-4 hover:underline"
          >
            Forgot password?
          </button>
        </div>
        <input
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-[oklch(0.88_0.04_80)] bg-[oklch(0.99_0.01_80)] px-4 py-3 text-base text-[oklch(0.20_0.01_60)] outline-none focus:border-[oklch(0.65_0.13_75)]"
        />

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 w-full rounded-lg py-3 font-medium tracking-wide transition disabled:opacity-60"
          style={{ background: "oklch(0.25 0.02 60)", color: "oklch(0.97 0.02 80)" }}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-[oklch(0.45_0.02_60)]">
        Don't have an account?{" "}
        <Link to="/portal/signup" className="underline underline-offset-4 text-[oklch(0.55_0.13_75)]">
          Sign up
        </Link>
      </p>

      <p className="mt-4 text-center text-xs text-[oklch(0.45_0.02_60)]">
        Are you a staff member?{" "}
        <Link to="/login" className="underline underline-offset-4">
          Log in here
        </Link>
      </p>
    </motion.div>
  );
}
