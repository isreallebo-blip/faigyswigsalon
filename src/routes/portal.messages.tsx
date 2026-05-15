import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { Send } from "lucide-react";
import { portalListMessages, portalSendMessage } from "@/lib/inbox.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/portal/messages")({
  component: PortalMessagesPage,
});

function PortalMessagesPage() {
  const list = useServerFn(portalListMessages);
  const send = useServerFn(portalSendMessage);
  const qc = useQueryClient();
  const [body, setBody] = useState("");

  const { data } = useQuery({
    queryKey: ["portal-messages"],
    queryFn: () => list(),
  });

  useEffect(() => {
    const ch = supabase
      .channel("portal-messages")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        qc.invalidateQueries({ queryKey: ["portal-messages"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const m = useMutation({
    mutationFn: () => send({ data: { body } }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["portal-messages"] });
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl tracking-wide">Messages</h1>
      <div className="rounded-2xl bg-white border border-[oklch(0.88_0.04_80)] p-4 min-h-[360px] flex flex-col gap-2">
        {(data?.messages ?? []).length === 0 && (
          <div className="text-center text-sm text-[oklch(0.45_0.02_60)] my-auto">
            No messages yet. Send us a message below — we'll reply by SMS or email.
          </div>
        )}
        {(data?.messages ?? []).map((mm) => {
          const isClient = mm.direction === "inbound";
          return (
            <div key={mm.id} className={`flex ${isClient ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
                  isClient
                    ? "bg-[oklch(0.55_0.13_75)] text-white"
                    : "bg-[oklch(0.95_0.02_80)] text-[oklch(0.20_0.01_60)]"
                }`}
              >
                <div>{mm.body}</div>
                <div className="text-[10px] mt-1 opacity-75">
                  {format(new Date(mm.created_at), "MMM d, h:mm a")}
                  {isClient && mm.delivery_status && ` · ${mm.delivery_status}`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="Type your message…"
          className="flex-1 rounded-xl border border-[oklch(0.88_0.04_80)] px-3 py-2 text-sm bg-white"
        />
        <button
          onClick={() => m.mutate()}
          disabled={!body.trim() || m.isPending}
          className="rounded-xl bg-[oklch(0.55_0.13_75)] text-white px-4 disabled:opacity-50 flex items-center gap-1.5"
        >
          <Send className="size-4" /> Send
        </button>
      </div>
    </div>
  );
}
