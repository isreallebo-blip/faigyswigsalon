import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/portal/verify")({
  validateSearch: (s: Record<string, unknown>) => ({
    method: (s.method as "email" | "phone") || "email",
    identifier: (s.identifier as string) || "",
  }),
  component: VerifyPage,
});

function VerifyPage() {
  const { method, identifier } = Route.useSearch();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const verify = async () => {
    if (code.length < 6) {
      toast.error("Enter the 6-digit code");
      return;
    }
    setSubmitting(true);
    try {
      const { error } =
        method === "email"
          ? await supabase.auth.verifyOtp({ email: identifier, token: code, type: "email" })
          : await supabase.auth.verifyOtp({ phone: identifier, token: code, type: "sms" });
      if (error) throw error;
      toast.success("Welcome");
      navigate({ to: "/portal" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid code");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-8">
      <h1 className="font-display text-3xl text-[oklch(0.22_0.02_60)]">Verify</h1>
      <p className="mt-1 text-sm text-[oklch(0.45_0.02_60)]">
        We sent a 6-digit code to <span className="font-medium">{identifier}</span>.
      </p>

      <div className="mt-8 space-y-3">
        <input
          autoFocus
          inputMode="numeric"
          maxLength={6}
          placeholder="••••••"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className="w-full text-center tracking-[0.6em] rounded-lg border border-[oklch(0.88_0.04_80)] bg-[oklch(0.99_0.01_80)] px-4 py-4 text-2xl text-[oklch(0.20_0.01_60)] outline-none focus:border-[oklch(0.65_0.13_75)]"
        />
        <button
          onClick={verify}
          disabled={submitting}
          className="w-full rounded-lg py-3 font-medium tracking-wide"
          style={{
            background: "oklch(0.25 0.02 60)",
            color: "oklch(0.97 0.02 80)",
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? "Verifying…" : "Verify & continue"}
        </button>
      </div>

      <p className="mt-8 text-center text-xs text-[oklch(0.45_0.02_60)]">
        <Link to="/portal/login" className="underline underline-offset-4">
          Use a different {method === "email" ? "email" : "number"}
        </Link>
      </p>
    </div>
  );
}
