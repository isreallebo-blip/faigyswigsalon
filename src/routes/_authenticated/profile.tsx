import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { useMyProfile } from "@/lib/use-profile";
import { updateMyProfile } from "@/lib/profile.functions";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "My profile — Faigy's Wig Salon" }] }),
  component: ProfilePage,
});

const profileSchema = z.object({
  first_name: z.string().trim().max(80).optional(),
  last_name: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(40).optional(),
});
type ProfileForm = z.infer<typeof profileSchema>;

const emailSchema = z.object({
  email: z.string().trim().email().max(255),
  current_password: z.string().min(1, "Confirm your current password"),
});
type EmailForm = z.infer<typeof emailSchema>;

const passwordSchema = z
  .object({
    current_password: z.string().min(1, "Required"),
    new_password: z.string().min(8, "At least 8 characters").max(72),
    confirm_password: z.string().min(8).max(72),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    path: ["confirm_password"],
    message: "Passwords do not match",
  });
type PasswordForm = z.infer<typeof passwordSchema>;

function ProfilePage() {
  const qc = useQueryClient();
  const profileQ = useMyProfile();
  const profile = profileQ.data;
  const updateProfile = useServerFn(updateMyProfile);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { first_name: "", last_name: "", phone: "" },
  });

  // Hydrate forms when profile loads.
  useEffect(() => {
    if (profile) {
      profileForm.reset({
        first_name: profile.first_name ?? "",
        last_name: profile.last_name ?? "",
        phone: profile.phone ?? "",
      });
      emailForm.reset({ email: profile.email ?? "", current_password: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const emailForm = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "", current_password: "" },
  });

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current_password: "", new_password: "", confirm_password: "" },
  });

  const profileMut = useMutation({
    mutationFn: async (data: ProfileForm) => {
      await updateProfile({
        data: {
          first_name: data.first_name || null,
          last_name: data.last_name || null,
          phone: data.phone || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update"),
  });

  const emailMut = useMutation({
    mutationFn: async (data: EmailForm) => {
      if (!profile?.email) throw new Error("Profile not loaded");
      // Re-authenticate by signing in with the current password.
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password: data.current_password,
      });
      if (reauthError) throw new Error("Current password is incorrect");

      const { error } = await supabase.auth.updateUser({ email: data.email });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Confirmation email sent. Check your new inbox to confirm.");
      emailForm.setValue("current_password", "");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update email"),
  });

  const passwordMut = useMutation({
    mutationFn: async (data: PasswordForm) => {
      if (!profile?.email) throw new Error("Profile not loaded");
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password: data.current_password,
      });
      if (reauthError) throw new Error("Current password is incorrect");
      const { error } = await supabase.auth.updateUser({ password: data.new_password });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Password updated");
      passwordForm.reset();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update password"),
  });

  const onAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !profile?.id) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5 MB");
      return;
    }
    setUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${profile.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      await updateProfile({ data: { avatar_url: data.publicUrl } });
      toast.success("Photo updated");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const removeAvatar = async () => {
    if (!profile) return;
    try {
      await updateProfile({ data: { avatar_url: null } });
      toast.success("Photo removed");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  if (profileQ.isLoading || !profile) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-10">
      <div>
        <h1 className="font-display text-3xl">My profile</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account information and password.
        </p>
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
              <h2 className="font-display text-xl">
                {profile.full_name || profile.email}
              </h2>
              <Badge variant={profile.role === "admin" ? "default" : "secondary"}>
                {profile.role}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{profile.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Last login:{" "}
              {profile.last_login_at
                ? new Date(profile.last_login_at).toLocaleString()
                : "—"}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onAvatarChange}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={uploadingAvatar}
            >
              <Camera className="h-4 w-4 mr-2" />
              {profile.avatar_url ? "Change" : "Upload"}
            </Button>
            {profile.avatar_url && (
              <Button size="sm" variant="ghost" onClick={removeAvatar}>
                Remove
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Personal info */}
      <section className="rounded-lg border border-border bg-card p-6">
        <h3 className="font-display text-lg mb-1">Personal information</h3>
        <p className="text-sm text-muted-foreground mb-5">
          Your name and contact info, visible to other staff.
        </p>
        <form
          onSubmit={profileForm.handleSubmit((d) => profileMut.mutate(d))}
          className="grid gap-4 sm:grid-cols-2"
        >
          <div className="space-y-2">
            <Label htmlFor="first_name">First name</Label>
            <Input id="first_name" {...profileForm.register("first_name")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name">Last name</Label>
            <Input id="last_name" {...profileForm.register("last_name")} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input id="phone" type="tel" {...profileForm.register("phone")} />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" disabled={profileMut.isPending}>
              {profileMut.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </section>

      {/* Email */}
      <section className="rounded-lg border border-border bg-card p-6">
        <h3 className="font-display text-lg mb-1">Email address</h3>
        <p className="text-sm text-muted-foreground mb-5">
          Changing your email requires confirming your current password. We'll send
          a confirmation link to your new address.
        </p>
        <form
          onSubmit={emailForm.handleSubmit((d) => emailMut.mutate(d))}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="email">New email</Label>
            <Input id="email" type="email" {...emailForm.register("email")} />
            {emailForm.formState.errors.email && (
              <p className="text-xs text-destructive">{emailForm.formState.errors.email.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email_current_password">Current password</Label>
            <Input
              id="email_current_password"
              type="password"
              autoComplete="current-password"
              {...emailForm.register("current_password")}
            />
            {emailForm.formState.errors.current_password && (
              <p className="text-xs text-destructive">
                {emailForm.formState.errors.current_password.message}
              </p>
            )}
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={emailMut.isPending}>
              {emailMut.isPending ? "Sending…" : "Update email"}
            </Button>
          </div>
        </form>
      </section>

      {/* Password */}
      <section className="rounded-lg border border-border bg-card p-6">
        <h3 className="font-display text-lg mb-1">Change password</h3>
        <p className="text-sm text-muted-foreground mb-5">
          Use at least 8 characters. We recommend a unique passphrase.
        </p>
        <form
          onSubmit={passwordForm.handleSubmit((d) => passwordMut.mutate(d))}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="current_password">Current password</Label>
            <Input
              id="current_password"
              type="password"
              autoComplete="current-password"
              {...passwordForm.register("current_password")}
            />
            {passwordForm.formState.errors.current_password && (
              <p className="text-xs text-destructive">
                {passwordForm.formState.errors.current_password.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="new_password">New password</Label>
            <Input
              id="new_password"
              type="password"
              autoComplete="new-password"
              {...passwordForm.register("new_password")}
            />
            {passwordForm.formState.errors.new_password && (
              <p className="text-xs text-destructive">
                {passwordForm.formState.errors.new_password.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm_password">Confirm new password</Label>
            <Input
              id="confirm_password"
              type="password"
              autoComplete="new-password"
              {...passwordForm.register("confirm_password")}
            />
            {passwordForm.formState.errors.confirm_password && (
              <p className="text-xs text-destructive">
                {passwordForm.formState.errors.confirm_password.message}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Link
              to="/forgot-password"
              className="text-xs text-muted-foreground self-center underline-offset-4 hover:underline"
            >
              Forgot current password?
            </Link>
            <Button type="submit" disabled={passwordMut.isPending}>
              {passwordMut.isPending ? "Updating…" : "Update password"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
