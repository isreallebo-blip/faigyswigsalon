import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getPortalMe, updatePortalProfile } from "@/lib/portal.functions";
import { Card } from "@/routes/portal.index";

export const Route = createFileRoute("/portal/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const meFn = useServerFn(getPortalMe);
  const updateFn = useServerFn(updatePortalProfile);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["portal-me"], queryFn: () => meFn() });

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    photo_url: "",
    sms_opt_in: true,
    email_opt_in: true,
  });

  useEffect(() => {
    if (q.data?.client) {
      setForm({
        full_name: q.data.client.full_name ?? "",
        phone: q.data.client.phone ?? "",
        email: q.data.client.email ?? "",
        photo_url: q.data.client.photo_url ?? "",
        sms_opt_in: q.data.client.sms_opt_in ?? true,
        email_opt_in: q.data.client.email_opt_in ?? true,
      });
    }
  }, [q.data]);

  const m = useMutation({
    mutationFn: () => updateFn({ data: form }),
    onSuccess: () => {
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["portal-me"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update"),
  });

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl text-[oklch(0.22_0.02_60)]">My Profile</h1>

      <Card>
        <p className="text-xs uppercase tracking-wider text-[oklch(0.55_0.13_75)]">Client ID</p>
        <p className="mt-1 font-display text-xl text-[oklch(0.22_0.02_60)]">
          {q.data?.client?.display_id ?? "—"}
        </p>
        <p className="mt-1 text-xs text-[oklch(0.45_0.02_60)]">
          Your permanent ID. Cannot be changed.
        </p>
      </Card>

      <Card>
        <div className="space-y-4">
          <Field
            label="Full name"
            value={form.full_name}
            onChange={(v) => setForm({ ...form, full_name: v })}
          />
          <Field
            label="Email"
            type="email"
            value={form.email}
            onChange={(v) => setForm({ ...form, email: v })}
          />
          <Field
            label="Phone"
            type="tel"
            value={form.phone}
            onChange={(v) => setForm({ ...form, phone: v })}
          />
          <Field
            label="Photo URL"
            value={form.photo_url}
            onChange={(v) => setForm({ ...form, photo_url: v })}
          />
          <button
            onClick={() => m.mutate()}
            disabled={m.isPending}
            className="w-full rounded-lg py-3 font-medium tracking-wide"
            style={{
              background: "oklch(0.25 0.02 60)",
              color: "oklch(0.97 0.02 80)",
              opacity: m.isPending ? 0.6 : 1,
            }}
          >
            {m.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </Card>

      <Card>
        <p className="text-xs uppercase tracking-wider text-[oklch(0.55_0.13_75)] mb-3">
          Notification preferences
        </p>
        <div className="space-y-3">
          <Toggle
            label="SMS notifications"
            description="Appointment reminders, repair updates, payment receipts"
            checked={form.sms_opt_in}
            onChange={(v) => setForm({ ...form, sms_opt_in: v })}
          />
          <Toggle
            label="Email notifications"
            description="Confirmations, receipts and updates by email"
            checked={form.email_opt_in}
            onChange={(v) => setForm({ ...form, email_opt_in: v })}
          />
        </div>
        <p className="mt-3 text-[11px] text-[oklch(0.45_0.02_60)]">
          Click "Save changes" above to apply. You can also reply STOP to any text message to unsubscribe instantly.
        </p>
      </Card>

      <Card>
        <p className="text-xs uppercase tracking-wider text-[oklch(0.55_0.13_75)]">
          Managed by salon staff
        </p>
        <p className="mt-2 text-sm text-[oklch(0.45_0.02_60)]">
          Head measurements, wig preferences, and notes are kept up to date by salon staff. Please
          mention any changes at your next visit.
        </p>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-[oklch(0.45_0.02_60)] mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[oklch(0.88_0.04_80)] bg-[oklch(0.99_0.01_80)] px-3 py-2 text-sm text-[oklch(0.20_0.01_60)] outline-none focus:border-[oklch(0.65_0.13_75)]"
      />
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-start justify-between gap-3 text-left"
    >
      <div>
        <div className="text-sm font-medium text-[oklch(0.20_0.01_60)]">{label}</div>
        {description && (
          <div className="text-[11px] text-[oklch(0.45_0.02_60)] mt-0.5">{description}</div>
        )}
      </div>
      <span
        className="mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition"
        style={{ background: checked ? "oklch(0.55 0.13 75)" : "oklch(0.85 0.02 80)" }}
      >
        <span
          className="inline-block h-5 w-5 rounded-full bg-white transition"
          style={{ transform: checked ? "translateX(22px)" : "translateX(2px)" }}
        />
      </span>
    </button>
  );
}
