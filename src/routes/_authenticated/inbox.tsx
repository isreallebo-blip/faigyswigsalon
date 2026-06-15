import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { format } from "date-fns";
import { Send, MessageSquare, CheckCircle2, StickyNote, Megaphone, Plus } from "lucide-react";
import {
  listConversations,
  getConversation,
  sendStaffReply,
  addInternalNote,
  setConversationStatus,
} from "@/lib/inbox.functions";
import { listBroadcasts } from "@/lib/broadcasts.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/lib/use-access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/inbox")({
  component: InboxPage,
});

type StatusFilter = "all" | "unread" | "replied" | "resolved";
type ChannelFilter = "all" | "sms" | "email" | "portal";
type ViewMode = "conversations" | "broadcasts";

function InboxPage() {
  const list = useServerFn(listConversations);
  const listBcasts = useServerFn(listBroadcasts);
  const { isAdmin } = useAccess();
  const qc = useQueryClient();
  const [view, setView] = useState<ViewMode>("conversations");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [channel, setChannel] = useState<ChannelFilter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const { data: conversations } = useQuery({
    queryKey: ["inbox-list", status, channel, search],
    queryFn: () => list({ data: { status, channel, search } }),
    enabled: view === "conversations",
  });

  const { data: broadcasts } = useQuery({
    queryKey: ["inbox-broadcasts"],
    queryFn: () => listBcasts(),
    enabled: view === "broadcasts",
  });

  // Realtime: invalidate on any conversation/message change
  useEffect(() => {
    const ch = supabase
      .channel("inbox-staff")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        qc.invalidateQueries({ queryKey: ["inbox-list"] });
        if (selected) qc.invalidateQueries({ queryKey: ["inbox-conv", selected] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        qc.invalidateQueries({ queryKey: ["inbox-list"] });
        if (selected) qc.invalidateQueries({ queryKey: ["inbox-conv", selected] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc, selected]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 h-[calc(100vh-7rem)]">
      <div className="flex flex-col border border-border rounded-xl overflow-hidden bg-card">
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h1 className="font-display text-lg flex items-center gap-2">
              <MessageSquare className="size-4" /> Inbox
            </h1>
            {isAdmin && (
              <Button asChild size="sm" className="gap-1.5">
                <Link to="/broadcasts/new">
                  <Plus className="size-3.5" /> New Broadcast
                </Link>
              </Button>
            )}
          </div>
          <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="conversations">Conversations</TabsTrigger>
              <TabsTrigger value="broadcasts" className="gap-1.5">
                <Megaphone className="size-3" /> Broadcasts
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {view === "conversations" && (
            <>
              <Input placeholder="Search by name, CLT ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <Tabs value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
                <TabsList className="grid grid-cols-4 w-full">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="unread">Unread</TabsTrigger>
                  <TabsTrigger value="replied">Replied</TabsTrigger>
                  <TabsTrigger value="resolved">Done</TabsTrigger>
                </TabsList>
              </Tabs>
              <Tabs value={channel} onValueChange={(v) => setChannel(v as ChannelFilter)}>
                <TabsList className="grid grid-cols-4 w-full">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="sms">SMS</TabsTrigger>
                  <TabsTrigger value="email">Email</TabsTrigger>
                  <TabsTrigger value="portal">Portal</TabsTrigger>
                </TabsList>
              </Tabs>
            </>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {(conversations ?? []).map((c) => {
            const client = (c as unknown as { clients?: { full_name?: string; display_id?: string } }).clients;
            const name = client?.full_name ?? "Unmatched";
            return (
              <button
                key={c.id}
                onClick={() => setSelected(c.id as string)}
                className={cn(
                  "w-full text-left px-3 py-3 border-b border-border/60 hover:bg-muted/50 transition",
                  selected === c.id && "bg-muted",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-sm truncate">{name}</div>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(c.last_message_at as string), "MMM d, h:mma")}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[10px] mt-1">
                  {client?.display_id && <span className="text-muted-foreground">{client.display_id}</span>}
                  {c.last_inbound_channel && (
                    <Badge variant="secondary" className="h-4 text-[9px] px-1.5">
                      {c.last_inbound_channel as string}
                    </Badge>
                  )}
                  {c.status === "unread" && (
                    <Badge className="h-4 text-[9px] px-1.5 bg-gold text-foreground">New</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.last_message_preview}</div>
              </button>
            );
          })}
          {!conversations?.length && (
            <div className="p-6 text-sm text-muted-foreground text-center">No conversations yet.</div>
          )}
        </div>
      </div>

      <div className="border border-border rounded-xl overflow-hidden bg-card flex flex-col">
        {selected ? (
          <ConversationView id={selected} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Select a conversation
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationView({ id }: { id: string }) {
  const get = useServerFn(getConversation);
  const reply = useServerFn(sendStaffReply);
  const note = useServerFn(addInternalNote);
  const setStatus = useServerFn(setConversationStatus);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["inbox-conv", id],
    queryFn: () => get({ data: { id } }),
  });

  const [body, setBody] = useState("");
  const [channel, setChannel] = useState<"sms" | "email">("sms");
  const [isNote, setIsNote] = useState(false);

  useEffect(() => {
    const conv = data?.conversation as { last_inbound_channel?: string } | undefined;
    if (conv?.last_inbound_channel === "email") setChannel("email");
    else if (conv?.last_inbound_channel === "sms" || conv?.last_inbound_channel === "portal") setChannel("sms");
  }, [data?.conversation]);

  const send = useMutation({
    mutationFn: async () => {
      if (isNote) return note({ data: { conversationId: id, body } });
      return reply({ data: { conversationId: id, body, channel } });
    },
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["inbox-conv", id] });
      qc.invalidateQueries({ queryKey: ["inbox-list"] });
      toast.success(isNote ? "Note added" : "Sent");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resolve = useMutation({
    mutationFn: () => setStatus({ data: { id, status: "resolved" } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox-list"] });
      qc.invalidateQueries({ queryKey: ["inbox-conv", id] });
      toast.success("Marked resolved");
    },
  });

  const conv = data?.conversation as { clients?: { full_name?: string; display_id?: string } } | undefined;
  const client = conv?.clients;
  const segments = Math.ceil(body.length / 160) || 1;

  return (
    <>
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <div className="font-medium">{client?.full_name ?? "Unmatched"}</div>
          {client?.display_id && (
            <div className="text-xs text-muted-foreground">{client.display_id}</div>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => resolve.mutate()}>
          <CheckCircle2 className="size-3.5 mr-1.5" /> Resolve
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {(data?.messages ?? []).map((m) => {
          const msg = m as {
            id: string;
            direction: "inbound" | "outbound";
            channel: string;
            body: string;
            sender_name: string | null;
            created_at: string;
            delivery_status: string;
          };
          const isInternal = msg.channel === "internal_note";
          const isOut = msg.direction === "outbound";
          return (
            <div key={msg.id} className={cn("flex", isOut ? "justify-end" : "justify-start")}>
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
                    Internal note — not sent to client
                  </div>
                )}
                <div>{msg.body}</div>
                <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-2">
                  <span>{msg.sender_name ?? (isOut ? "Staff" : "Client")}</span>
                  <span>·</span>
                  <span>{format(new Date(msg.created_at), "MMM d, h:mm a")}</span>
                  {!isInternal && (
                    <>
                      <span>·</span>
                      <span className="uppercase">{msg.channel}</span>
                      {isOut && (
                        <>
                          <span>·</span>
                          <span>{msg.delivery_status}</span>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => setIsNote(false)}
            className={cn("px-2 py-1 rounded", !isNote && "bg-muted font-medium")}
          >
            Reply
          </button>
          <button
            onClick={() => setIsNote(true)}
            className={cn("px-2 py-1 rounded flex items-center gap-1", isNote && "bg-amber-100 font-medium text-amber-900")}
          >
            <StickyNote className="size-3" /> Internal note
          </button>
          {!isNote && (
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => setChannel("sms")}
                className={cn("px-2 py-1 rounded", channel === "sms" && "bg-muted font-medium")}
              >
                SMS
              </button>
              <button
                onClick={() => setChannel("email")}
                className={cn("px-2 py-1 rounded", channel === "email" && "bg-muted font-medium")}
              >
                Email
              </button>
            </div>
          )}
        </div>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={isNote ? "Internal note (only staff will see this)…" : `Reply via ${channel}…`}
          rows={3}
        />
        <div className="flex items-center justify-between">
          {!isNote && channel === "sms" && (
            <div className={cn("text-[10px]", body.length > 140 && "text-amber-600")}>
              {body.length} chars · {segments} segment{segments > 1 ? "s" : ""}
            </div>
          )}
          <Button size="sm" onClick={() => send.mutate()} disabled={!body.trim() || send.isPending} className="ml-auto">
            <Send className="size-3.5 mr-1.5" /> Send
          </Button>
        </div>
      </div>
    </>
  );
}
