import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { toast } from "sonner";
import { Send, Megaphone } from "lucide-react";
import { getClientThread, sendQuickMessage } from "@/lib/inbox.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { hebrewDateString } from "@/lib/hebrew-calendar";
import { cn } from "@/lib/utils";

type ThreadItem =
  | {
      kind: "message";
      id: string;
      created_at: string;
      direction: "inbound" | "outbound";
      channel: string;
      body: string;
      sender_name: string | null;
      delivery_status: string;
    }
  | {
      kind: "broadcast";
      id: string;
      created_at: string;
      channel: string;
      body: string;
      sender_name: string | null;
      subject: string | null;
      status: string;
    };

export function ClientMessages({
  clientId,
  clientHasPhone,
  clientHasEmail,
}: {
  clientId: string;
  clientHasPhone: boolean;
  clientHasEmail: boolean;
}) {
  const get = useServerFn(getClientThread);
  const send = useServerFn(sendQuickMessage);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["client-thread", clientId],
    queryFn: () => get({ data: { clientId } }),
  });

  useEffect(() => {
    const ch = supabase
      .channel(`client-thread-${clientId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `client_id=eq.${clientId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["client-thread", clientId] });
          qc.invalidateQueries({ queryKey: ["client-unread", clientId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [clientId, qc]);

  const items = useMemo<ThreadItem[]>(() => {
    const msgs: ThreadItem[] = (data?.messages ?? []).map((m) => {
      const r = m as {
        id: string;
        direction: "inbound" | "outbound";
        channel: string;
        body: string;
        sender_name: string | null;
        created_at: string;
        delivery_status: string;
      };
      return {
        kind: "message",
        id: r.id,
        created_at: r.created_at,
        direction: r.direction,
        channel: r.channel,
        body: r.body,
        sender_name: r.sender_name,
        delivery_status: r.delivery_status,
      };
    });
    const bc: ThreadItem[] = (data?.broadcasts ?? []).map((b) => {
      const r = b as {
        id: string;
        channel: string;
        status: string;
        created_at: string;
        broadcasts?: { body?: string; email_subject?: string | null; sent_by_name?: string | null };
      };
      return {
        kind: "broadcast",
        id: `bc-${r.id}`,
        created_at: r.created_at,
        channel: r.channel,
        body: r.broadcasts?.body ?? "",
        subject: r.broadcasts?.email_subject ?? null,
        sender_name: r.broadcasts?.sent_by_name ?? "Salon",
        status: r.status,
      };
    });
    return [...msgs, ...bc].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  }, [data]);

  const defaultChannel: "sms" | "email" = clientHasPhone ? "sms" : "email";
  const [channel, setChannel] = useState<"sms" | "email">(defaultChannel);
  const [body, setBody] = useState("");
  const segments = Math.ceil(body.length / 160) || 1;

  const sendMut = useMutation({
    mutationFn: () => send({ data: { clientId, channel, body } }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["client-thread", clientId] });
      qc.invalidateQueries({ queryKey: ["inbox-list"] });
      qc.invalidateQueries({ queryKey: ["client-unread", clientId] });
      toast.success("Sent");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSendSms = channel === "sms" ? clientHasPhone : true;
  const canSendEmail = channel === "email" ? clientHasEmail : true;
  const canSend = canSendSms && canSendEmail && !!body.trim() && !sendMut.isPending;

  return (
    <div className="flex flex-col border border-border rounded-xl bg-card overflow-hidden h-[calc(100vh-22rem)] min-h-[480px]">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {items.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-12">
            No messages yet. Send the first one below.
          </div>
        )}
        {items.map((it) => {
          if (it.kind === "broadcast") {
            return (
              <div key={it.id} className="flex justify-center">
                <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-muted/60 border border-dashed border-border">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
                    <Megaphone className="size-3" /> Broadcast message
                  </div>
                  {it.subject && <div className="font-medium">{it.subject}</div>}
                  <div className="whitespace-pre-wrap">{it.body}</div>
                  <MetaRow created_at={it.created_at} channel={it.channel} sender={it.sender_name} status={it.status} />
                </div>
              </div>
            );
          }
          const isInternal = it.channel === "internal_note";
          const isOut = it.direction === "outbound";
          return (
            <div key={it.id} className={cn("flex", isOut ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[75%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                  isInternal
                    ? "bg-amber-100 text-amber-900 border border-amber-300"
                    : isOut
                      ? "bg-gold/20 border border-gold/40"
                      : "bg-muted",
                )}
              >
                {isInternal && (
                  <div className="text-[10px] uppercase tracking-wider font-semibold mb-1 text-amber-700">
                    Internal note — not visible to client
                  </div>
                )}
                <div>{it.body}</div>
                <MetaRow
                  created_at={it.created_at}
                  channel={isInternal ? null : it.channel}
                  sender={it.sender_name ?? (isOut ? "Staff" : "Client")}
                  status={!isInternal && isOut ? it.delivery_status : null}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            disabled={!clientHasPhone}
            onClick={() => setChannel("sms")}
            className={cn(
              "px-2 py-1 rounded",
              channel === "sms" && "bg-muted font-medium",
              !clientHasPhone && "opacity-40 cursor-not-allowed",
            )}
          >
            SMS
          </button>
          <button
            type="button"
            disabled={!clientHasEmail}
            onClick={() => setChannel("email")}
            className={cn(
              "px-2 py-1 rounded",
              channel === "email" && "bg-muted font-medium",
              !clientHasEmail && "opacity-40 cursor-not-allowed",
            )}
          >
            Email
          </button>
          {channel === "sms" && (
            <span className={cn("ml-auto text-[10px]", body.length > 140 && "text-amber-600")}>
              {body.length} chars · {segments} segment{segments > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <Textarea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={`Message client via ${channel}…`}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={() => sendMut.mutate()} disabled={!canSend}>
            <Send className="size-3.5 mr-1.5" /> Send
          </Button>
        </div>
      </div>
    </div>
  );
}

function MetaRow({
  created_at,
  channel,
  sender,
  status,
}: {
  created_at: string;
  channel: string | null;
  sender: string | null;
  status: string | null;
}) {
  const d = new Date(created_at);
  return (
    <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
      <span>{sender}</span>
      <span>·</span>
      <span>{format(d, "MMM d, h:mm a")}</span>
      <span>·</span>
      <span title="Hebrew date">{hebrewDateString(d)}</span>
      {channel && (
        <>
          <span>·</span>
          <Badge variant="outline" className="h-4 text-[9px] px-1.5 uppercase">
            {channel}
          </Badge>
        </>
      )}
      {status && (
        <>
          <span>·</span>
          <span className="capitalize">{status}</span>
        </>
      )}
    </div>
  );
}
