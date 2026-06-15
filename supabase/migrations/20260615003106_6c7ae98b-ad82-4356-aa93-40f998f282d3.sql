
-- Add SMS cost setting and broadcast processing state
ALTER TABLE public.messaging_settings
  ADD COLUMN IF NOT EXISTS sms_cost_per_segment numeric(10,5) NOT NULL DEFAULT 0.00790;

ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS recipient_filter_summary text;

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_status
  ON public.broadcast_recipients (status, broadcast_id);

CREATE INDEX IF NOT EXISTS idx_broadcasts_created
  ON public.broadcasts (created_at DESC);
