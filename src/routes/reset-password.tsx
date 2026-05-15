import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z
  .object({
    password: z.string().min(8, "At least 8 characters").max(72),
    confirm: z.string().min(8).max(72),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });
type FormValues = z.infer<typeof schema>;

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Set new password — Faigy's Wig Salon" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Wait for the recovery/invite session to be established from the URL hash.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

  const onSubmit = async ({ password }: FormValues) => {
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated");
      navigate({ to: "/" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update password");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl">Set new password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a strong password to access the salon.
        </p>

        {!ready ? (
          <p className="mt-8 text-sm text-muted-foreground">
            Waiting for your secure link to be verified…
          </p>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                {...form.register("password")}
              />
              {form.formState.errors.password && (
                <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                {...form.register("confirm")}
              />
              {form.formState.errors.confirm && (
                <p className="text-xs text-destructive">{form.formState.errors.confirm.message}</p>
              )}
            </div>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Saving…" : "Save password"}
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
