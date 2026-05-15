-- Enums
CREATE TYPE public.conversation_status AS ENUM ('unread','read','replied','resolved');
CREATE TYPE public.message_direction AS ENUM ('inbound','outbound');
CREATE TYPE public.message_channel AS ENUM ('sms','email','portal','internal_note');
CREATE TYPE public.message_delivery_status AS ENUM ('queued','sent','delivered','read','failed');
CREATE TYPE public.broadcast_channel AS ENUM ('sms','email','both');

-- conversations
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  subject text,
  status public.conversation_status NOT NULL DEFAULT 'unread',
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_message_preview text,
  last_inbound_channel public.message_channel,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  auto_reply_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_conversations_status_last ON public.conversations(status, last_message_at DESC);
CREATE INDEX idx_conversations_client ON public.conversations(client_id);
CREATE INDEX idx_conversations_assigned ON public.conversations(assigned_to);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage conversations" ON public.conversations
  FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
CREATE POLICY "client read own conversations" ON public.conversations
  FOR SELECT TO authenticated USING (client_id = current_client_id());
CREATE POLICY "client insert own conversation" ON public.conversations
  FOR INSERT TO authenticated WITH CHECK (client_id = current_client_id());

CREATE TRIGGER trg_conversations_touch BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- messages
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  direction public.message_direction NOT NULL,
  channel public.message_channel NOT NULL,
  body text NOT NULL,
  subject text,
  sender_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_name text,
  provider_message_id text,
  in_reply_to text,
  delivery_status public.message_delivery_status NOT NULL DEFAULT 'queued',
  delivery_error text,
  read_by_staff_at timestamptz,
  read_by_client_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_conversation_created ON public.messages(conversation_id, created_at);
CREATE INDEX idx_messages_provider_id ON public.messages(provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX idx_messages_client ON public.messages(client_id);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage messages" ON public.messages
  FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
CREATE POLICY "client read own messages" ON public.messages
  FOR SELECT TO authenticated USING (
    client_id = current_client_id() AND channel <> 'internal_note'
  );
CREATE POLICY "client insert own portal message" ON public.messages
  FOR INSERT TO authenticated WITH CHECK (
    client_id = current_client_id()
    AND direction = 'inbound'
    AND channel = 'portal'
    AND sender_user_id IS NULL
  );

-- broadcasts
CREATE TABLE public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sent_by_name text,
  channel public.broadcast_channel NOT NULL,
  body text NOT NULL,
  email_subject text,
  recipient_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  recipient_count int NOT NULL DEFAULT 0,
  sent_count int NOT NULL DEFAULT 0,
  delivered_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage broadcasts" ON public.broadcasts
  FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE TABLE public.broadcast_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name text,
  channel public.message_channel NOT NULL,
  recipient text,
  status public.message_delivery_status NOT NULL DEFAULT 'queued',
  error_message text,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_broadcast_recipients_broadcast ON public.broadcast_recipients(broadcast_id);
ALTER TABLE public.broadcast_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage broadcast_recipients" ON public.broadcast_recipients
  FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

-- messaging_settings (single row, id=1)
CREATE TABLE public.messaging_settings (
  id int PRIMARY KEY DEFAULT 1,
  business_hours jsonb NOT NULL DEFAULT '{
    "sun":{"open":"09:00","close":"18:00","enabled":true},
    "mon":{"open":"09:00","close":"18:00","enabled":true},
    "tue":{"open":"09:00","close":"18:00","enabled":true},
    "wed":{"open":"09:00","close":"18:00","enabled":true},
    "thu":{"open":"09:00","close":"18:00","enabled":true},
    "fri":{"open":"09:00","close":"13:00","enabled":true},
    "sat":{"open":"00:00","close":"00:00","enabled":false}
  }'::jsonb,
  timezone text NOT NULL DEFAULT 'Asia/Jerusalem',
  auto_reply_enabled boolean NOT NULL DEFAULT true,
  auto_reply_body text NOT NULL DEFAULT 'Hi [First Name], thank you for your message! We''ll get back to you during business hours. — Faigy''s Wig Salon',
  default_reply_channel public.message_channel NOT NULL DEFAULT 'sms',
  default_assignee uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messaging_settings_singleton CHECK (id = 1)
);
ALTER TABLE public.messaging_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read messaging_settings" ON public.messaging_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff write messaging_settings" ON public.messaging_settings
  FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

INSERT INTO public.messaging_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TRIGGER trg_messaging_settings_touch BEFORE UPDATE ON public.messaging_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;