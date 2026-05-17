import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Camera, Check, Loader2, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { useMyProfile } from "@/lib/use-profile";
import { updateMyProfile } from "@/lib/profile.functions";
import { useVerifiedAction } from "@/components/verification-gate";
import {
  changePasswordVerified,
  confirmPhoneChange,
  getPendingEmailChange,
  requestEmailChange,
  requestPhoneChange,
} from "@/lib/verification.functions";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "My profile — Faigy's Wig Salon" }] }),
  component: ProfilePage,
});

const profileSchema = z.object({
  first_name: z.string().trim().max(80).optional(),
  last_name: z.string().trim().max(80).optional(),
});
type ProfileForm = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    new_password: z
      .string()
      .min(8, "At least 8 characters")
      .regex(/[A-Z]/, "Must include an uppercase letter")
      .regex(/[0-9]/, "Must include a number")
      .regex(/[^A-Za-z0-9]/, "Must include a special character")
      .max(72),
    confirm_password: z.string().min(8).max(72),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    path: ["confirm_password"],
    message: "Passwords do not match",
  });
type PasswordForm = z.infer<typeof passwordSchema>;

function strength(pw: string): "weak" | "fair" | "strong" {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (s >= 4) return "strong";
  if (s >= 2) return "fair";
  return "weak";
}

function ProfilePage() {
  const qc = useQueryClient();
  const profileQ = useMyProfile();
  const profile = profileQ.data;
  const updateProfile = useServerFn(updateMyProfile);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const verifyAction = useVerifiedAction();

  // Personal info
  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { first_name: "", last_name: "" },
  });
  useEffect(() => {
    if (profile) {
      profileForm.reset({
        first_name: profile.first_name ?? "",
        last_name: profile.last_name ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const profileMut = useMutation({
    mutationFn: async (data: ProfileForm) => {
      await updateProfile({
        data: {
          first_name: data.first_name || null,
          last_name: data.last_name || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update"),
  });

  // Email change
  const requestEmail = useServerFn(requestEmailChange);
  const pendingEmailFn = useServerFn(getPendingEmailChange);
  const pendingEmailQ = useQuery({ queryKey: ["pending-email"], queryFn: () => pendingEmailFn() });
  const [newEmail, setNewEmail] = useState("");
  const emailMut = useMutation({
    mutationFn: (email: string) => requestEmail({ data: { newEmail: email } }),
    onSuccess: () => {
      toast.success("Confirmation email sent to the new address");
      setNewEmail("");
      qc.invalidateQueries({ queryKey: ["pending-email"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  // Password
  const changePw = useServerFn(changePasswordVerified);
  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { new_password: "", confirm_password: "" },
  });
  const pwValue = passwordForm.watch("new_password");
  const passwordMut = useMutation({
    mutationFn: (data: PasswordForm) => changePw({ data: { newPassword: data.new_password } }),
    onSuccess: () => {
      toast.success("Password updated. Other sessions have been signed out.");
      passwordForm.reset();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  // Phone
  const reqPhone = useServerFn(requestPhoneChange);
  const confirmPhone = useServerFn(confirmPhoneChange);
  const [newPhone, setNewPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phonePending, setPhonePending] = useState(false);
  const reqPhoneMut = useMutation({
    mutationFn: (p: string) => reqPhone({ data: { newPhone: p } }),
    onSuccess: () => { setPhonePending(true); toast.success("Code sent to the new number"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const confirmPhoneMut = useMutation({
    mutationFn: (c: string) => confirmPhone({ data: { code: c } }),
    onSuccess: () => {
      toast.success("Phone updated");
      setPhonePending(false); setPhoneCode(""); setNewPhone("");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  // Avatar handlers (unchanged)
  const onAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !profile?.id) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5 MB"); return; }
    setUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${profile.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      await updateProfile({ data: { avatar_url: data.publicUrl } });
      toast.success("Photo updated");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally { setUploadingAvatar(false); }
  };
  const removeAvatar = async () => {
    if (!profile) return;
    try {
      await updateProfile({ data: { avatar_url: null } });
      toast.success("Photo removed");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  if (profileQ.isLoading || !profile) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  const pwStrength = pwValue ? strength(pwValue) : null;
  const reqs = [
    { ok: pwValue.length >= 8, label: "At least 8 characters" },
    { ok: /[0-9]/.test(pwValue), label: "At least one number" },
    { ok: /[A-Z]/.test(pwValue), label: "At least one uppercase letter" },
    { ok: /[^A-Za-z0-9]/.test(pwValue), label: "At least one special character" },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-10">
      {verifyAction.gate}

      <div>
        <h1 className="font-display text-3xl">My profile</h1>
        <p className="text-sm text-muted-foreground">Manage your account information.</p>
      </div>

      {/* Avatar + identity */}
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-5">
          <div className="relative">
            <UserAvatar profile={profile} size={80} />
            {uploadingAvatar && (
              <div className="absolute inset-0 grid place-items-center rounded-full bg-foreground/40">
                <Loader2 className="h-5 w-5 animate-spin text-background" />
              </div>
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-xl">{profile.full_name || profile.email}</h2>
              <Badge variant={profile.role === "admin" ? "default" : "secondary"}>{profile.role}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{profile.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Last login: {profile.last_login_at ? new Date(profile.last_login_at).toLocaleString() : "—"}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onAvatarChange} />
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploadingAvatar}>
              <Camera className="h-4 w-4 mr-2" />{profile.avatar_url ? "Change" : "Upload"}
            </Button>
            {profile.avatar_url && <Button size="sm" variant="ghost" onClick={removeAvatar}>Remove</Button>}
          </div>
        </div>
      </section>

      {/* Personal info */}
      <section className="rounded-lg border border-border bg-card p-6">
        <h3 className="font-display text-lg mb-1">Personal information</h3>
        <p className="text-sm text-muted-foreground mb-5">Your name, visible to other staff.</p>
        <form onSubmit={profileForm.handleSubmit((d) => profileMut.mutate(d))} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="first_name">First name</Label>
            <Input id="first_name" {...profileForm.register("first_name")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name">Last name</Label>
            <Input id="last_name" {...profileForm.register("last_name")} />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" disabled={profileMut.isPending}>{profileMut.isPending ? "Saving…" : "Save changes"}</Button>
          </div>
        </form>
      </section>

      {/* Email */}
      <section className="rounded-lg border border-border bg-card p-6">
        <h3 className="font-display text-lg mb-1">Email address</h3>
        <p className="text-sm text-muted-foreground mb-5">
          We'll verify your identity, then send a confirmation link to the new address.
        </p>
        {pendingEmailQ.data && (
          <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Email change pending to <strong>{pendingEmailQ.data.newEmail}</strong> — check that inbox to confirm.
          </div>
        )}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="email">New email</Label>
            <Input id="email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          </div>
          <div className="flex justify-end">
            <Button
              disabled={!newEmail || emailMut.isPending}
              onClick={() =>
                verifyAction.run(() => emailMut.mutate(newEmail), {
                  reason: "Verify your identity to change your email address.",
                })
              }
            >
              {emailMut.isPending ? "Sending…" : "Change email"}
            </Button>
          </div>
        </div>
      </section>

      {/* Phone */}
      <section className="rounded-lg border border-border bg-card p-6">
        <h3 className="font-display text-lg mb-1">Phone number</h3>
        <p className="text-sm text-muted-foreground mb-5">
          Current: {profile.phone ?? <span className="italic">none</span>}. We'll send a code to the new number to confirm.
        </p>
        {!phonePending ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="phone">New phone</Label>
              <Input id="phone" type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
            </div>
            <div className="flex justify-end">
              <Button
                disabled={!newPhone || reqPhoneMut.isPending}
                onClick={() =>
                  verifyAction.run(() => reqPhoneMut.mutate(newPhone), {
                    reason: "Verify your identity to change your phone number.",
                  })
                }
              >
                {reqPhoneMut.isPending ? "Sending…" : "Change phone"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Label htmlFor="phone-code">Enter the 6-digit code sent to {newPhone}</Label>
            <Input id="phone-code" inputMode="numeric" maxLength={6} value={phoneCode} onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, ""))} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setPhonePending(false); setPhoneCode(""); }}>Cancel</Button>
              <Button disabled={phoneCode.length !== 6 || confirmPhoneMut.isPending} onClick={() => confirmPhoneMut.mutate(phoneCode)}>
                {confirmPhoneMut.isPending ? "Confirming…" : "Confirm new phone"}
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Password */}
      <section className="rounded-lg border border-border bg-card p-6">
        <h3 className="font-display text-lg mb-1">Change password</h3>
        <p className="text-sm text-muted-foreground mb-5">
          We'll verify your identity first. Choose a strong unique passphrase.
        </p>
        <form onSubmit={passwordForm.handleSubmit((d) => verifyAction.run(() => passwordMut.mutate(d), { reason: "Verify your identity to change your password." }))} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new_password">New password</Label>
            <Input id="new_password" type="password" autoComplete="new-password" {...passwordForm.register("new_password")} />
            {passwordForm.formState.errors.new_password && (
              <p className="text-xs text-destructive">{passwordForm.formState.errors.new_password.message}</p>
            )}
            {pwStrength && (
              <p className="text-xs">
                Strength:{" "}
                <span className={
                  pwStrength === "strong" ? "text-emerald-600" :
                  pwStrength === "fair" ? "text-amber-600" : "text-destructive"
                }>{pwStrength}</span>
              </p>
            )}
            <ul className="text-xs space-y-1 mt-1">
              {reqs.map((r) => (
                <li key={r.label} className={r.ok ? "text-emerald-600" : "text-muted-foreground"}>
                  {r.ok ? <Check className="inline h-3 w-3 mr-1" /> : <X className="inline h-3 w-3 mr-1" />}{r.label}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm_password">Confirm new password</Label>
            <Input id="confirm_password" type="password" autoComplete="new-password" {...passwordForm.register("confirm_password")} />
            {passwordForm.formState.errors.confirm_password && (
              <p className="text-xs text-destructive">{passwordForm.formState.errors.confirm_password.message}</p>
            )}
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={passwordMut.isPending}>{passwordMut.isPending ? "Updating…" : "Update password"}</Button>
          </div>
        </form>
      </section>
    </div>
  );
}
