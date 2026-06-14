import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTurnstilePublicConfig } from "@/lib/intuit.functions";

// Cloudflare Turnstile widget used to gate payment workflows
// (card tokenization, charges, refunds). The site key is fetched from the
// server because Lovable reserves the VITE_ prefix for managed secrets.

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: { sitekey: string; callback: (token: string) => void; "error-callback"?: () => void; "expired-callback"?: () => void },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function ensureScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src^="${SCRIPT_URL.split("?")[0]}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Turnstile")));
      if (window.turnstile) resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT_URL;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Turnstile"));
    document.head.appendChild(s);
  });
}

export function TurnstileWidget({ onToken }: { onToken: (token: string | null) => void }) {
  const fetchCfg = useServerFn(getTurnstilePublicConfig);
  const cfg = useQuery({ queryKey: ["turnstile-cfg"], queryFn: () => fetchCfg() });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const siteKey = cfg.data?.siteKey;
    if (!siteKey || !containerRef.current) return;

    ensureScript()
      .then(() => {
        if (cancelled || !window.turnstile || !containerRef.current) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token: string) => onToken(token),
          "error-callback": () => {
            setError("CAPTCHA error. Try again.");
            onToken(null);
          },
          "expired-callback": () => onToken(null),
        });
      })
      .catch((e: Error) => setError(e.message));

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore
        }
        widgetIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.data?.siteKey]);

  if (cfg.isLoading) return <div className="text-xs text-muted-foreground">Loading CAPTCHA…</div>;
  if (!cfg.data?.siteKey) {
    return (
      <div className="text-xs text-destructive">
        CAPTCHA is not configured. Ask an admin to set TURNSTILE_SITE_KEY.
      </div>
    );
  }
  return (
    <div>
      <div ref={containerRef} />
      {error && <div className="text-xs text-destructive mt-1">{error}</div>}
    </div>
  );
}
