
-- Client preferences
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS sms_opt_in boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_opt_in boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS outstanding_balance_reminded_at timestamptz;

-- Appointment reschedule detection
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS last_notified_starts_at timestamptz;

-- Templates
CREATE TABLE IF NOT EXISTS public.notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  category text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  send_sms boolean NOT NULL DEFAULT true,
  send_email boolean NOT NULL DEFAULT true,
  sms_body text NOT NULL DEFAULT '',
  email_subject text NOT NULL DEFAULT '',
  email_body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff manage notification_templates" ON public.notification_templates
  FOR ALL TO authenticated
  USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "portal read enabled templates" ON public.notification_templates
  FOR SELECT TO authenticated
  USING (is_staff(auth.uid()) OR enabled = true);

CREATE TRIGGER notification_templates_touch
  BEFORE UPDATE ON public.notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Log
CREATE TABLE IF NOT EXISTS public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid,
  template_key text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('sms','email')),
  recipient text,
  subject text,
  body text,
  status text NOT NULL CHECK (status IN ('sent','delivered','failed','skipped')),
  error_message text,
  provider_message_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_log_client_created
  ON public.notification_log (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_log_status
  ON public.notification_log (status, created_at DESC);

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read notification_log" ON public.notification_log
  FOR SELECT TO authenticated
  USING (is_staff(auth.uid()) OR client_id = current_client_id());

CREATE POLICY "staff insert notification_log" ON public.notification_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- Seed templates
INSERT INTO public.notification_templates (key, label, category, sms_body, email_subject, email_body, send_sms, send_email) VALUES
('appointment_confirmation','Appointment confirmation','appointment',
 'Hi [First Name], your appointment at Faigy''s Wig Salon is confirmed for [Day], [Date] at [Time]. See you soon! — Faigy''s Wig Salon',
 'Your appointment is confirmed',
 'Hi [First Name],\n\nYour appointment at Faigy''s Wig Salon is confirmed for [Day], [Date] at [Time].\n\nSee you soon!\n— Faigy''s Wig Salon',
 true, true),
('appointment_reminder_24h','Appointment reminder — 24h','appointment',
 'Hi [First Name], just a reminder that you have an appointment tomorrow, [Date] at [Time] at Faigy''s Wig Salon. — Faigy''s Wig Salon',
 'Appointment reminder — tomorrow',
 'Hi [First Name],\n\nJust a reminder that you have an appointment tomorrow, [Date] at [Time] at Faigy''s Wig Salon.\n\n— Faigy''s Wig Salon',
 true, true),
('appointment_reminder_2h','Appointment reminder — 2h','appointment',
 'Hi [First Name], your appointment at Faigy''s Wig Salon is in 2 hours at [Time]. See you soon! — Faigy''s Wig Salon',
 'Appointment reminder — in 2 hours',
 'Hi [First Name],\n\nYour appointment at Faigy''s Wig Salon is in 2 hours at [Time]. See you soon!\n\n— Faigy''s Wig Salon',
 true, true),
('appointment_cancelled','Appointment cancelled','appointment',
 'Hi [First Name], your appointment on [Date] at [Time] at Faigy''s Wig Salon has been cancelled. Please contact us to reschedule. — Faigy''s Wig Salon',
 'Your appointment was cancelled',
 'Hi [First Name],\n\nYour appointment on [Date] at [Time] at Faigy''s Wig Salon has been cancelled. Please contact us to reschedule.\n\n— Faigy''s Wig Salon',
 true, true),
('appointment_rescheduled','Appointment rescheduled','appointment',
 'Hi [First Name], your appointment has been rescheduled to [Day], [Date] at [Time] at Faigy''s Wig Salon. — Faigy''s Wig Salon',
 'Your appointment was rescheduled',
 'Hi [First Name],\n\nYour appointment has been rescheduled to [Day], [Date] at [Time] at Faigy''s Wig Salon.\n\n— Faigy''s Wig Salon',
 true, true),
('wig_sent_to_repair','Wig sent to repair','wig',
 'Hi [First Name], your wig has been sent to our repair shop. Estimated return: [Date]. We''ll let you know as soon as it''s back! — Faigy''s Wig Salon',
 'Your wig has been sent for repair',
 'Hi [First Name],\n\nYour wig has been sent to our repair shop. Estimated return: [Date]. We''ll let you know as soon as it''s back!\n\n— Faigy''s Wig Salon',
 true, true),
('wig_ready_for_pickup','Wig ready for pickup','wig',
 'Hi [First Name], great news! Your wig is back from the repair shop and ready for your next appointment. We''ll be in touch to schedule. — Faigy''s Wig Salon',
 'Your wig is ready',
 'Hi [First Name],\n\nGreat news! Your wig is back from the repair shop and ready for your next appointment. We''ll be in touch to schedule.\n\n— Faigy''s Wig Salon',
 true, true),
('custom_order_arrived','Custom order arrived','wig',
 'Hi [First Name], your custom wig order has arrived at Faigy''s Wig Salon! We''ll be reaching out shortly to schedule your fitting appointment. — Faigy''s Wig Salon',
 'Your custom order has arrived',
 'Hi [First Name],\n\nYour custom wig order has arrived at Faigy''s Wig Salon! We''ll be reaching out shortly to schedule your fitting appointment.\n\n— Faigy''s Wig Salon',
 true, true),
('payment_received','Payment received','payment',
 'Hi [First Name], we received your payment of $[Amount] on [Date]. Thank you! — Faigy''s Wig Salon',
 'Payment received — thank you',
 'Hi [First Name],\n\nWe received your payment of $[Amount] on [Date]. Thank you!\n\n— Faigy''s Wig Salon',
 true, false),
('payment_receipt','Payment receipt','payment',
 '',
 'Receipt from Faigy''s Wig Salon',
 '__RECEIPT__',
 false, true),
('outstanding_balance','Outstanding balance reminder','payment',
 'Hi [First Name], this is a friendly reminder that you have an outstanding balance of $[Amount] at Faigy''s Wig Salon. Please contact us at your convenience. — Faigy''s Wig Salon',
 'Friendly balance reminder',
 'Hi [First Name],\n\nThis is a friendly reminder that you have an outstanding balance of $[Amount] at Faigy''s Wig Salon. Please contact us at your convenience.\n\n— Faigy''s Wig Salon',
 true, true),
('wash_set_dropoff','Wash & set — drop-off','wash_set',
 'Hi [First Name], we received your wig at Faigy''s Wig Salon on [Date]. It will be washed, dried, and ready for your styling appointment on [Appointment Date]. — Faigy''s Wig Salon',
 'We received your wig',
 'Hi [First Name],\n\nWe received your wig at Faigy''s Wig Salon on [Date]. It will be washed, dried, and ready for your styling appointment on [Appointment Date].\n\n— Faigy''s Wig Salon',
 true, true),
('wash_set_ready','Wash & set — ready for styling','wash_set',
 'Hi [First Name], your wig has been washed and is all set for your styling appointment on [Date] at [Time]. See you then! — Faigy''s Wig Salon',
 'Your wig is washed and ready',
 'Hi [First Name],\n\nYour wig has been washed and is all set for your styling appointment on [Date] at [Time]. See you then!\n\n— Faigy''s Wig Salon',
 true, true)
ON CONFLICT (key) DO NOTHING;
