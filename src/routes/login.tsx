import { createFileRoute, useNavigate, redirect, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ensureBootstrapAdmin } from "@/lib/bootstrap.functions";
import { recordLastLogin } from "@/lib/admin-users.functions";

const schema = z.object({
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string().min(6, "At least 6 characters").max(72),
});
type FormValues = z.infer<typeof schema>;

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>) => ({ redirect: (s.redirect as string) || "/" }),
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: search.redirect });
  },
  head: () => ({ meta: [{ title: "Sign in — Faigy's Wig Salon" }] }),
  component: LoginPage,
});

function LoginPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    ensureBootstrapAdmin().catch(() => {});
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword(values);
      if (error) throw error;

      // Gate staff CRM access on profile status — independent of the client
      // portal account that may share this email.
      const result = await recordLastLogin().catch(() => ({ ok: true as const }));
      if ("ok" in result && result.ok === false) {
        await supabase.auth.signOut();
        if (result.reason === "disabled") {
          toast.error("This staff account has been disabled. Contact an admin.");
        } else {
          toast.error("This email isn't a staff account. Use the Client Portal to log in.");
        }
        return;
      }

      toast.success("Welcome back");
      navigate({ to: search.redirect });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{
        background: "linear-gradient(180deg, oklch(0.98 0.015 80) 0%, oklch(0.96 0.025 80) 100%)",
      }}
    >
      <div className="mx-auto max-w-6xl px-5 py-10">
        {/* Shared brand header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 font-display text-3xl tracking-wide text-[oklch(0.22_0.02_60)]">
            <Sparkles className="h-5 w-5 text-[oklch(0.65_0.13_75)]" />
            Faigy's Wig Salon
          </div>
          <p className="mt-1 text-xs uppercase tracking-[0.22em] text-[oklch(0.45_0.02_60)]">
            Sign in
          </p>
        </div>

        <div className="relative mt-12 grid gap-10 lg:grid-cols-2 lg:gap-0">
          {/* LEFT — Staff */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="lg:pr-12"
          >
            <div className="mx-auto w-full max-w-sm rounded-2xl border border-border bg-background p-8 shadow-sm">
              <h2 className="font-display text-2xl">Staff Login</h2>
              <p className="mt-1 text-sm text-muted-foreground">Sign in to the salon CRM.</p>

              <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
                  {form.formState.errors.email && (
                    <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <Link
                      to="/forgot-password"
                      className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    {...form.register("password")}
                  />
                  {form.formState.errors.password && (
                    <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
                  )}
                </div>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-primary text-primary-foreground hover:opacity-90"
                >
                  {submitting ? "Signing in…" : "Sign in"}
                </Button>
              </form>

              <p className="mt-6 text-center text-xs text-muted-foreground">
                Staff access only — by invitation
              </p>
            </div>
          </motion.div>

          {/* Divider */}
          <div className="hidden lg:block absolute left-1/2 top-0 bottom-0 -translate-x-1/2">
            <div className="relative h-full w-px bg-[oklch(0.88_0.04_80)]">
              <span
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.25em]"
                style={{
                  background: "oklch(0.98 0.015 80)",
                  color: "oklch(0.45 0.02 60)",
                }}
              >
                or
              </span>
            </div>
          </div>
          <div className="flex items-center justify-center lg:hidden">
            <span className="text-[10px] uppercase tracking-[0.25em] text-[oklch(0.45_0.02_60)]">
              or
            </span>
          </div>

          {/* RIGHT — Client */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="lg:pl-12"
          >
            <div
              className="mx-auto w-full max-w-sm rounded-2xl p-8 shadow-sm"
              style={{
                background:
                  "linear-gradient(180deg, oklch(0.97 0.025 80) 0%, oklch(0.94 0.04 80) 100%)",
                border: "1px solid oklch(0.88 0.05 80)",
              }}
            >
              <h2 className="font-display text-2xl text-[oklch(0.22_0.02_60)]">Client Portal</h2>
              <p className="mt-1 text-sm text-[oklch(0.45_0.02_60)]">
                View your appointments, wigs, payments and more.
              </p>

              <div className="mt-6 space-y-3">
                <Link
                  to="/portal/signup"
                  className="block w-full rounded-lg py-3 text-center font-medium tracking-wide transition"
                  style={{
                    background: "oklch(0.65 0.13 75)",
                    color: "oklch(0.99 0.01 80)",
                  }}
                >
                  Sign up
                </Link>
                <Link
                  to="/portal/login"
                  className="block w-full rounded-lg py-3 text-center font-medium tracking-wide transition"
                  style={{
                    background: "oklch(0.99 0.01 80)",
                    color: "oklch(0.25 0.02 60)",
                    border: "1px solid oklch(0.85 0.05 80)",
                  }}
                >
                  Log in
                </Link>
              </div>

              <p className="mt-6 text-center text-xs text-[oklch(0.45_0.02_60)]">
                For clients of Faigy's Wig Salon
              </p>
            </div>
          </motion.div>
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Are you a staff member?{" "}
          <a href="#" onClick={(e) => { e.preventDefault(); document.getElementById("email")?.focus(); }} className="underline underline-offset-4">
            Log in here
          </a>
        </p>

        <footer className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Faigy's Wig Salon</span>
          <span className="hidden sm:inline">·</span>
          <div className="flex gap-4">
            <Link to="/terms" className="hover:text-foreground underline underline-offset-4">Terms</Link>
            <Link to="/privacy" className="hover:text-foreground underline underline-offset-4">Privacy</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
