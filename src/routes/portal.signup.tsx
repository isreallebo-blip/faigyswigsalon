import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Mail, Phone, ArrowLeft } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/portal/signup")({
  head: () => ({ meta: [{ title: "Sign up — Client Portal" }] }),
  component: PortalSignupPage,
});

type Step = "method" | "identifier" | "code" | "details";
type Method = "email" | "phone";

function PortalSignupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<Method>("email");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const back = () => {
    if (step === "identifier") setStep("method");
    else if (step === "code") setStep("identifier");
    else if (step === "details") setStep("code");
  };

  const sendCode = async () => {
    const value = identifier.trim();
    if (!value) {
      toast.error(`Enter your ${method === "email" ? "email" : "phone number"}`);
      return;
    }
    setSubmitting(true);
    try {
      const opts = { data: { portal: true }, shouldCreateUser: true };
      const { error } =
        method === "email"
          ? await supabase.auth.signInWithOtp({ email: value, options: opts })
          : await supabase.auth.signInWithOtp({ phone: value, options: opts });
      if (error) throw error;
      toast.success("Verification code sent");
      setStep("code");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send code");
    } finally {
      setSubmitting(false);
    }
  };

  const verifyCode = async () => {
    const token = code.trim();
    if (token.length !== 6) {
      toast.error("Enter the 6-digit code");
      return;
    }
    setSubmitting(true);
    try {
      const { error } =
        method === "email"
          ? await supabase.auth.verifyOtp({ email: identifier.trim(), token, type: "email" })
          : await supabase.auth.verifyOtp({ phone: identifier.trim(), token, type: "sms" });
      if (error) throw error;
      setStep("details");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid or expired code");
    } finally {
      setSubmitting(false);
    }
  };

  const finish = async () => {
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("Please enter your full name");
      return;
    }
    setSubmitting(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`;
      const { error } = await supabase.auth.updateUser({
        password,
        data: {
          portal: true,
          full_name: fullName,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
        },
      });
      if (error) throw error;
      toast.success("Account created");
      navigate({ to: "/portal" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not finish signup");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen px-5 py-10"
      style={{
        background: "linear-gradient(180deg, oklch(0.98 0.015 80) 0%, oklch(0.96 0.025 80) 100%)",
      }}
    >
      <div className="mx-auto max-w-md">
        <div className="text-center">
          <Link to="/login" className="font-display text-2xl tracking-wide text-[oklch(0.22_0.02_60)]">
            Faigy's Wig Salon
          </Link>
          <p className="mt-1 text-xs uppercase tracking-[0.22em] text-[oklch(0.45_0.02_60)]">
            Create your client account
          </p>
        </div>

        <motion.div
          key={step}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mt-8 rounded-2xl bg-[oklch(0.99_0.01_80)] p-8 shadow-sm border border-[oklch(0.88_0.04_80)]"
        >
          {step !== "method" && (
            <button
              onClick={back}
              className="mb-4 inline-flex items-center gap-1 text-xs text-[oklch(0.45_0.02_60)] hover:text-[oklch(0.20_0.01_60)]"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
          )}

          {step === "method" && (
            <>
              <h1 className="font-display text-2xl text-[oklch(0.22_0.02_60)]">How would you like to sign up?</h1>
              <p className="mt-1 text-sm text-[oklch(0.45_0.02_60)]">
                We'll send a 6-digit verification code.
              </p>
              <div className="mt-6 space-y-3">
                <button
                  onClick={() => { setMethod("email"); setStep("identifier"); }}
                  className="flex w-full items-center gap-3 rounded-lg border border-[oklch(0.85_0.05_80)] bg-[oklch(0.99_0.01_80)] px-4 py-3 text-left transition hover:border-[oklch(0.65_0.13_75)]"
                >
                  <Mail className="h-5 w-5 text-[oklch(0.65_0.13_75)]" />
                  <span className="font-medium text-[oklch(0.22_0.02_60)]">Continue with Email</span>
                </button>
                <button
                  onClick={() => { setMethod("phone"); setStep("identifier"); }}
                  className="flex w-full items-center gap-3 rounded-lg border border-[oklch(0.85_0.05_80)] bg-[oklch(0.99_0.01_80)] px-4 py-3 text-left transition hover:border-[oklch(0.65_0.13_75)]"
                >
                  <Phone className="h-5 w-5 text-[oklch(0.65_0.13_75)]" />
                  <span className="font-medium text-[oklch(0.22_0.02_60)]">Continue with Phone Number</span>
                </button>
              </div>
            </>
          )}

          {step === "identifier" && (
            <>
              <h1 className="font-display text-2xl text-[oklch(0.22_0.02_60)]">
                {method === "email" ? "Your email" : "Your phone number"}
              </h1>
              <p className="mt-1 text-sm text-[oklch(0.45_0.02_60)]">
                We'll send a 6-digit code to verify it's you.
              </p>
              <input
                autoFocus
                type={method === "email" ? "email" : "tel"}
                inputMode={method === "email" ? "email" : "tel"}
                placeholder={method === "email" ? "you@example.com" : "+1 555 555 5555"}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="mt-6 w-full rounded-lg border border-[oklch(0.88_0.04_80)] bg-[oklch(0.99_0.01_80)] px-4 py-3 text-base outline-none focus:border-[oklch(0.65_0.13_75)]"
              />
              <button
                onClick={sendCode}
                disabled={submitting}
                className="mt-4 w-full rounded-lg py-3 font-medium tracking-wide transition disabled:opacity-60"
                style={{ background: "oklch(0.25 0.02 60)", color: "oklch(0.97 0.02 80)" }}
              >
                {submitting ? "Sending…" : "Send code"}
              </button>
            </>
          )}

          {step === "code" && (
            <>
              <h1 className="font-display text-2xl text-[oklch(0.22_0.02_60)]">Enter the code</h1>
              <p className="mt-1 text-sm text-[oklch(0.45_0.02_60)]">
                Sent to {identifier}. Code expires in 10 minutes.
              </p>
              <input
                autoFocus
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="mt-6 w-full rounded-lg border border-[oklch(0.88_0.04_80)] bg-[oklch(0.99_0.01_80)] px-4 py-3 text-center text-2xl tracking-[0.5em] tabular-nums outline-none focus:border-[oklch(0.65_0.13_75)]"
              />
              <button
                onClick={verifyCode}
                disabled={submitting}
                className="mt-4 w-full rounded-lg py-3 font-medium tracking-wide transition disabled:opacity-60"
                style={{ background: "oklch(0.25 0.02 60)", color: "oklch(0.97 0.02 80)" }}
              >
                {submitting ? "Verifying…" : "Verify"}
              </button>
              <button
                onClick={sendCode}
                disabled={submitting}
                className="mt-3 w-full text-center text-xs text-[oklch(0.45_0.02_60)] underline-offset-4 hover:underline"
              >
                Resend code
              </button>
            </>
          )}

          {step === "details" && (
            <>
              <h1 className="font-display text-2xl text-[oklch(0.22_0.02_60)]">Almost there</h1>
              <p className="mt-1 text-sm text-[oklch(0.45_0.02_60)]">
                Set a password and tell us your name.
              </p>
              <div className="mt-6 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    placeholder="First name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="rounded-lg border border-[oklch(0.88_0.04_80)] bg-[oklch(0.99_0.01_80)] px-4 py-3 text-base outline-none focus:border-[oklch(0.65_0.13_75)]"
                  />
                  <input
                    placeholder="Last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="rounded-lg border border-[oklch(0.88_0.04_80)] bg-[oklch(0.99_0.01_80)] px-4 py-3 text-base outline-none focus:border-[oklch(0.65_0.13_75)]"
                  />
                </div>
                <input
                  type="password"
                  placeholder="Password (min 8 characters)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-[oklch(0.88_0.04_80)] bg-[oklch(0.99_0.01_80)] px-4 py-3 text-base outline-none focus:border-[oklch(0.65_0.13_75)]"
                />
              </div>
              <button
                onClick={finish}
                disabled={submitting}
                className="mt-4 w-full rounded-lg py-3 font-medium tracking-wide transition disabled:opacity-60"
                style={{ background: "oklch(0.25 0.02 60)", color: "oklch(0.97 0.02 80)" }}
              >
                {submitting ? "Creating account…" : "Create account"}
              </button>
            </>
          )}
        </motion.div>

        <p className="mt-6 text-center text-xs text-[oklch(0.45_0.02_60)]">
          Already have an account?{" "}
          <Link to="/portal/login" className="underline underline-offset-4 text-[oklch(0.55_0.13_75)]">
            Log in
          </Link>
        </p>
        <p className="mt-2 text-center text-xs text-[oklch(0.45_0.02_60)]">
          Are you a staff member?{" "}
          <Link to="/login" className="underline underline-offset-4">
            Log in here
          </Link>
        </p>
      </div>
    </div>
  );
}
