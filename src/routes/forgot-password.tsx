import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  email: z.string().trim().email().max(255),
});
type FormValues = z.infer<typeof schema>;

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Reset password — Faigy's Wig Salon" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const onSubmit = async ({ email }: FormValues) => {
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
      toast.success("Check your inbox for a reset link");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send reset email");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl">Reset password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter your email and we'll send you a link to set a new password.
        </p>

        {sent ? (
          <div className="mt-8 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            If an account with that email exists, a reset link is on its way.
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}

        <Link
          to="/login"
          className="mt-6 block text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
