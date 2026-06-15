import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  appendMessage,
  getOrCreateOpenConversation,
  plainEmailHtml,
  replyToForConversation,
  sendEmailRaw,
  sendSmsRaw,
} from "@/lib/inbox/send.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ConvFilter = z.object({
  status: z.enum(["all", "unread", "replied", "resolved"]).default("all"),
  channel: z.enum(["all", "sms", "email", "portal"]).default("all"),
  search: z.string().optional(),
});

export const listConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ConvFilter.parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("conversations")
      .select(
        "id, status, last_message_at, last_message_preview, last_inbound_channel, assigned_to, client_id, clients:client_id(full_name, display_id)",
      )
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") q = q.eq("status", data.status === "unread" ? "unread" : data.status);
    if (data.channel !== "all") q = q.eq("last_inbound_channel", data.channel);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    let result = rows ?? [];
    if (data.search) {
      const s = data.search.toLowerCase();
      result = result.filter((r) => {
        const c = (r as unknown as { clients?: { full_name?: string; display_id?: string } }).clients;
        return (
          c?.full_name?.toLowerCase().includes(s) ||
          c?.display_id?.toLowerCase().includes(s) ||
          (r.last_message_preview as string | null)?.toLowerCase().includes(s)
        );
      });
    }
    return result;
  });

export const unreadCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count } = await context.supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("status", "unread");
    return { count: count ?? 0 };
  });

export const getStaffUnreadCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count } = await context.supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("direction", "inbound")
      .neq("channel", "internal_note")
      .is("read_by_staff_at", null);
    return count ?? 0;
  });

export const getConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: conv, error } = await context.supabase
      .from("conversations")
      .select(
        "id, status, last_message_at, assigned_to, client_id, auto_reply_sent_at, last_inbound_channel, clients:client_id(id, full_name, display_id, phone, email)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!conv) throw new Error("Conversation not found");
    const { data: messages } = await context.supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", data.id)
      .order("created_at", { ascending: true });
    // Mark as read for staff
    await context.supabase
      .from("conversations")
      .update({ status: conv.status === "unread" ? "read" : conv.status })
      .eq("id", data.id);
    return { conversation: conv, messages: messages ?? [] };
  });

export const sendStaffReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        conversationId: z.string().uuid(),
        body: z.string().trim().min(1).max(4000),
        channel: z.enum(["sms", "email"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: conv } = await supabaseAdmin
      .from("conversations")
      .select("id, client_id, clients:client_id(full_name, phone, email)")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (!conv) throw new Error("Conversation not found");
    const client = (conv as unknown as { clients?: { full_name?: string; phone?: string | null; email?: string | null } }).clients;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    const senderName = profile?.full_name ?? profile?.email ?? "Staff";

    let providerId: string | null = null;
    let error: string | null = null;
    if (data.channel === "sms") {
      if (!client?.phone) throw new Error("Client has no phone number");
      const r = await sendSmsRaw(client.phone, `${data.body}\n\nReply STOP to unsubscribe`);
      providerId = r.id ?? null;
      error = r.error ?? null;
    } else {
      if (!client?.email) throw new Error("Client has no email address");
      const subject = `Faigy's Wig Salon`;
      const r = await sendEmailRaw({
        to: client.email,
        subject,
        html: plainEmailHtml(data.body, data.conversationId),
        replyTo: replyToForConversation(data.conversationId),
      });
      providerId = r.id ?? null;
      error = r.error ?? null;
    }

    await appendMessage({
      conversationId: data.conversationId,
      clientId: conv.client_id as string,
      direction: "outbound",
      channel: data.channel,
      body: data.body,
      senderUserId: context.userId,
      senderName,
      providerMessageId: providerId,
      deliveryStatus: error ? "failed" : "sent",
      deliveryError: error,
    });

    return { ok: !error, error };
  });

export const addInternalNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ conversationId: z.string().uuid(), body: z.string().trim().min(1).max(4000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: conv } = await supabaseAdmin
      .from("conversations")
      .select("client_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    await appendMessage({
      conversationId: data.conversationId,
      clientId: (conv?.client_id as string) ?? null,
      direction: "outbound",
      channel: "internal_note",
      body: data.body,
      senderUserId: context.userId,
      senderName: profile?.full_name ?? profile?.email ?? "Staff",
    });
    return { ok: true };
  });

export const setConversationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["unread", "read", "replied", "resolved"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("conversations")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const assignConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), userId: z.string().uuid().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("conversations")
      .update({ assigned_to: data.userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendQuickMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        clientId: z.string().uuid(),
        channel: z.enum(["sms", "email"]),
        body: z.string().trim().min(1).max(4000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const conversationId = await getOrCreateOpenConversation(data.clientId, data.body.slice(0, 140), data.channel);
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("phone, email")
      .eq("id", data.clientId)
      .maybeSingle();
    let providerId: string | null = null;
    let error: string | null = null;
    if (data.channel === "sms") {
      if (!client?.phone) throw new Error("Client has no phone number");
      const r = await sendSmsRaw(client.phone, `${data.body}\n\nReply STOP to unsubscribe`);
      providerId = r.id ?? null;
      error = r.error ?? null;
    } else {
      if (!client?.email) throw new Error("Client has no email address");
      const r = await sendEmailRaw({
        to: client.email,
        subject: "Faigy's Wig Salon",
        html: plainEmailHtml(data.body, conversationId),
        replyTo: replyToForConversation(conversationId),
      });
      providerId = r.id ?? null;
      error = r.error ?? null;
    }
    await appendMessage({
      conversationId,
      clientId: data.clientId,
      direction: "outbound",
      channel: data.channel,
      body: data.body,
      senderUserId: context.userId,
      senderName: profile?.full_name ?? profile?.email ?? "Staff",
      providerMessageId: providerId,
      deliveryStatus: error ? "failed" : "sent",
      deliveryError: error,
    });
    return { ok: !error, error, conversationId };
  });

// ===== Portal-side =====

export const portalListMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: client } = await context.supabase
      .from("clients")
      .select("id")
      .maybeSingle();
    type Msg = {
      id: string;
      direction: "inbound" | "outbound";
      channel: "sms" | "email" | "portal" | "internal_note";
      body: string;
      sender_name: string | null;
      created_at: string;
      delivery_status: string;
      read_by_client_at: string | null;
    };
    type Conv = { id: string; status: string };
    const empty: { conversation: Conv | null; messages: Msg[] } = { conversation: null, messages: [] };
    if (!client) return empty;
    const clientId = client.id as string;
    const { data: conv } = await context.supabase
      .from("conversations")
      .select("id, status")
      .eq("client_id", clientId)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!conv) return empty;
    const { data: messages } = await context.supabase
      .from("messages")
      .select("id, direction, channel, body, sender_name, created_at, delivery_status, read_by_client_at")
      .eq("conversation_id", conv.id)
      .neq("channel", "internal_note")
      .order("created_at", { ascending: true });
    // Mark inbound (from staff) as read by client
    await context.supabase
      .from("messages")
      .update({ read_by_client_at: new Date().toISOString() })
      .eq("conversation_id", conv.id)
      .eq("direction", "outbound")
      .is("read_by_client_at", null);
    return { conversation: conv as Conv, messages: (messages ?? []) as unknown as Msg[] };
  });

export const portalSendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ body: z.string().trim().min(1).max(4000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: client } = await context.supabase
      .from("clients")
      .select("id, full_name")
      .maybeSingle();
    if (!client) throw new Error("Client not found");
    const clientId = client.id as string;
    const conversationId = await getOrCreateOpenConversation(clientId, data.body.slice(0, 140), "portal");
    await appendMessage({
      conversationId,
      clientId,
      direction: "inbound",
      channel: "portal",
      body: data.body,
      senderName: (client.full_name as string) ?? "Client",
      deliveryStatus: "delivered",
    });
    return { ok: true, conversationId };
  });

// ===== Staff list (for assignment dropdown) =====

export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("id, full_name, email")
      .order("full_name", { ascending: true });
    return data ?? [];
  });

// ===== Client profile thread =====

export const getClientThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: messages } = await context.supabase
      .from("messages")
      .select("id, conversation_id, direction, channel, body, sender_name, created_at, delivery_status, read_by_staff_at, read_by_client_at")
      .eq("client_id", data.clientId)
      .order("created_at", { ascending: true });

    const { data: broadcasts } = await context.supabase
      .from("broadcast_recipients")
      .select("id, broadcast_id, channel, status, created_at, broadcasts:broadcast_id(body, email_subject, sent_by_name)")
      .eq("client_id", data.clientId)
      .order("created_at", { ascending: true });

    // Pick most recent open conversation, else null (composer creates one)
    const { data: conv } = await context.supabase
      .from("conversations")
      .select("id, status")
      .eq("client_id", data.clientId)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Mark inbound (from client) as read by staff
    await context.supabase
      .from("messages")
      .update({ read_by_staff_at: new Date().toISOString() })
      .eq("client_id", data.clientId)
      .eq("direction", "inbound")
      .is("read_by_staff_at", null);

    return {
      messages: messages ?? [],
      broadcasts: broadcasts ?? [],
      conversation: conv,
    };
  });

export const getClientUnreadCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { count } = await context.supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("client_id", data.clientId)
      .eq("direction", "inbound")
      .is("read_by_staff_at", null);
    return { count: count ?? 0 };
  });
