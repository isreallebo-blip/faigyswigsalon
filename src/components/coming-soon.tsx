import { Sparkles } from "lucide-react";

export function ComingSoon({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-soft">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent text-accent-foreground">
          <Sparkles className="h-5 w-5" />
        </div>
        <h1 className="mt-6 font-display text-4xl">{title}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">{blurb}</p>
        <p className="mt-6 text-xs uppercase tracking-[0.22em] text-gold">Coming in the next phase</p>
      </div>
    </div>
  );
}
