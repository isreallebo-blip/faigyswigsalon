import { createFileRoute, useNavigate, redirect, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import loginBg from "@/assets/login-bg.jpg";
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
  head: () => ({ meta: [{ title: "Sign in — Maison" }] }),
  component: LoginPage,
});

function LoginPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  // Fire-and-forget bootstrap on first load.
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
      // Record last login (non-blocking).
      recordLastLogin().catch(() => {});
      toast.success("Welcome back");
      navigate({ to: search.redirect });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="relative hidden lg:block overflow-hidden">
        <img src={loginBg} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-tr from-background/40 via-transparent to-background/20" />
        <div className="relative z-10 flex h-full flex-col justify-between p-12">
          <div className="font-display text-3xl tracking-wide">Maison</div>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="max-w-md"
          >
            <p className="font-display text-4xl leading-tight text-foreground">
              Where every cut, color, and consultation finds its place.
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              The quiet command center for your wig salon.
            </p>
          </motion.div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12 bg-background">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-sm"
        >
          <div className="mb-10 lg:hidden">
            <div className="font-display text-3xl">Maison</div>
            <p className="text-sm text-muted-foreground">Wig salon CRM</p>
          </div>

          <h1 className="font-display text-3xl">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">Welcome back to your salon.</p>

          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-4">
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
            Access is invite-only. Contact your salon admin if you need an account.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
