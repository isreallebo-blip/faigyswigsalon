// Reusable card charging section used by the New Payment dialog and the
// "Charge Card" client-profile modal. Provides:
//   - Tabs: "Charge new card" / "Use saved card" (if any exist)
//   - Cloudflare Turnstile CAPTCHA gating
//   - Server-side tokenization (card POSTed over TLS, never persisted)
//   - Optional vaulting of the card on success
//
// On a successful charge it calls `onCharged` with the resulting
// payment_transactions row + display metadata. The parent decides what to
// do next (create the payments row, close the modal, etc.).

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Loader2, Lock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import {
  chargeNewCardFlow,
  chargeSavedCardFlow,
  saveNewCardFlow,
  listClientPaymentMethods,
  getPaymentsConnectivity,
} from "@/lib/intuit.functions";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getOrCreateDeviceId } from "@/lib/device-id";

export interface ChargeResult {
  transactionId: string;
  intuitTid: string | null;
  chargeId: string;
  authCode: string | null;
  last4: string | null;
  brand: string | null;
  amountCents: number;
}

export function CardChargeSection({
  clientId,
  amountCents,
  description,
  onCharged,
  disabled,
  triggerLabel = "Charge card",
}: {
  clientId: string | null;
  amountCents: number;
  description?: string | null;
  onCharged: (r: ChargeResult) => void | Promise<void>;
  disabled?: boolean;
  triggerLabel?: string;
}) {
  const connFn = useServerFn(getPaymentsConnectivity);
  const conn = useQuery({ queryKey: ["payments-conn"], queryFn: () => connFn() });

  const listFn = useServerFn(listClientPaymentMethods);
  const saved = useQuery({
    queryKey: ["client-cards", clientId],
    queryFn: () => listFn({ data: { clientId: clientId! } }),
    enabled: !!clientId,
  });

  if (conn.isLoading) {
    return <div className="text-xs text-muted-foreground">Checking card processor…</div>;
  }
  if (!conn.data?.connected) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
        <AlertTriangle className="inline h-3 w-3 mr-1" />
        Credit card processing is not configured.{" "}
        <Link to="/settings/quickbooks" className="underline font-medium">
          Go to Settings &gt; QuickBooks
        </Link>{" "}
        to connect.
      </div>
    );
  }
  if (!clientId) {
    return (
      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        Select a client above to charge a card.
      </div>
    );
  }

  const hasSaved = (saved.data ?? []).length > 0;

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Lock className="h-3 w-3" /> Card data is sent over TLS, tokenized by
        QuickBooks, and never stored on our servers.
      </div>
      <Tabs defaultValue={hasSaved ? "saved" : "new"}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="new">Charge new card</TabsTrigger>
          <TabsTrigger value="saved" disabled={!hasSaved}>
            Use saved card{hasSaved ? ` (${saved.data!.length})` : ""}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="new" className="pt-3">
          <NewCardTab
            clientId={clientId}
            amountCents={amountCents}
            description={description ?? null}
            onCharged={onCharged}
            disabled={disabled}
            triggerLabel={triggerLabel}
          />
        </TabsContent>
        <TabsContent value="saved" className="pt-3">
          <SavedCardTab
            cards={saved.data ?? []}
            amountCents={amountCents}
            description={description ?? null}
            onCharged={onCharged}
            disabled={disabled}
            triggerLabel={triggerLabel}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type Card = Awaited<ReturnType<typeof listClientPaymentMethods>>[number];

function formatAmount(c: number) {
  return `$${(c / 100).toFixed(2)}`;
}

function NewCardTab({
  clientId,
  amountCents,
  description,
  onCharged,
  disabled,
  triggerLabel,
}: {
  clientId: string;
  amountCents: number;
  description: string | null;
  onCharged: (r: ChargeResult) => void | Promise<void>;
  disabled?: boolean;
  triggerLabel: string;
}) {
  const chargeFn = useServerFn(chargeNewCardFlow);
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [name, setName] = useState("");
  const [zip, setZip] = useState("");
  const [saveCard, setSaveCard] = useState(false);
  const [setDefault, setSetDefault] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: async () => {
      if (!turnstileToken) throw new Error("Complete the CAPTCHA first");
      const match = expiry.match(/^(\d{1,2})\s*\/\s*(\d{2,4})$/);
      if (!match) throw new Error("Expiry must be MM/YY");
      const month = parseInt(match[1], 10);
      let year = parseInt(match[2], 10);
      if (year < 100) year += 2000;
      if (amountCents <= 0) throw new Error("Enter an amount above zero");
      return chargeFn({
        data: {
          clientId,
          cardNumber: cardNumber.replace(/\s+/g, ""),
          expMonth: month,
          expYear: year,
          cvv: cvv.trim(),
          cardholderName: name.trim(),
          postalCode: zip.trim(),
          amountCents,
          description: description || null,
          saveCard,
          setDefault: saveCard ? setDefault : false,
          deviceId: getOrCreateDeviceId() || null,
          turnstileToken,
        },
      });
    },
    onSuccess: async (res) => {
      toast.success("Card charged");
      await onCharged({
        transactionId: res.transaction.id,
        intuitTid: res.intuitTid ?? null,
        chargeId: res.charge.id,
        authCode: res.authCode ?? null,
        last4: res.last4 ?? null,
        brand: res.brand ?? null,
        amountCents,
      });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Charge failed"),
  });

  const ready =
    !!turnstileToken && cardNumber && expiry && cvv && name && zip && amountCents > 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Card number</Label>
          <Input
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="4111 1111 1111 1111"
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Expiry (MM/YY)</Label>
          <Input
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="12/28"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">CVV</Label>
          <Input
            inputMode="numeric"
            autoComplete="cc-csc"
            placeholder="123"
            value={cvv}
            onChange={(e) => setCvv(e.target.value)}
          />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Cardholder name</Label>
          <Input
            autoComplete="cc-name"
            placeholder="Jane Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Billing zip</Label>
          <Input
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="10952"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <Checkbox checked={saveCard} onCheckedChange={(v) => setSaveCard(!!v)} />
        Save this card for future use
      </label>
      {saveCard && (
        <label className="flex items-center gap-2 text-xs cursor-pointer pl-6">
          <Checkbox checked={setDefault} onCheckedChange={(v) => setSetDefault(!!v)} />
          Make it the default card for this client
        </label>
      )}

      <TurnstileWidget onToken={setTurnstileToken} />

      <Button
        size="sm"
        className="gap-2"
        onClick={() => m.mutate()}
        disabled={disabled || m.isPending || !ready}
      >
        {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
        {triggerLabel} {formatAmount(amountCents)}
      </Button>
    </div>
  );
}

function SavedCardTab({
  cards,
  amountCents,
  description,
  onCharged,
  disabled,
  triggerLabel,
}: {
  cards: Card[];
  amountCents: number;
  description: string | null;
  onCharged: (r: ChargeResult) => void | Promise<void>;
  disabled?: boolean;
  triggerLabel: string;
}) {
  const chargeFn = useServerFn(chargeSavedCardFlow);
  const defaultCard = useMemo(() => cards.find((c) => c.is_default) ?? cards[0], [cards]);
  const [selectedId, setSelectedId] = useState<string>(defaultCard?.id ?? "");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId && defaultCard) setSelectedId(defaultCard.id);
  }, [defaultCard, selectedId]);

  const m = useMutation({
    mutationFn: async () => {
      if (!turnstileToken) throw new Error("Complete the CAPTCHA first");
      if (!selectedId) throw new Error("Select a card");
      if (amountCents <= 0) throw new Error("Enter an amount above zero");
      return chargeFn({
        data: {
          paymentMethodId: selectedId,
          amountCents,
          description: description || null,
          deviceId: getOrCreateDeviceId() || null,
          turnstileToken,
        },
      });
    },
    onSuccess: async (res) => {
      toast.success("Card charged");
      await onCharged({
        transactionId: res.transaction.id,
        intuitTid: res.intuitTid ?? null,
        chargeId: res.charge.id,
        authCode: res.authCode ?? null,
        last4: res.last4 ?? null,
        brand: res.brand ?? null,
        amountCents,
      });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Charge failed"),
  });

  if (cards.length === 0) {
    return <p className="text-xs text-muted-foreground">No saved cards.</p>;
  }
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Saved card</Label>
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger>
            <SelectValue placeholder="Pick a card" />
          </SelectTrigger>
          <SelectContent>
            {cards.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {(c.card_brand ?? "Card")} ending in {c.last4 ?? "????"}
                {c.exp_month && c.exp_year
                  ? ` (exp ${String(c.exp_month).padStart(2, "0")}/${String(c.exp_year).slice(-2)})`
                  : ""}
                {c.is_default ? " · Default" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-md border bg-background p-2 text-sm">
        About to charge <span className="font-medium">{formatAmount(amountCents)}</span> to the
        selected card.
      </div>
      <TurnstileWidget onToken={setTurnstileToken} />
      <Button
        size="sm"
        className="gap-2"
        onClick={() => m.mutate()}
        disabled={disabled || m.isPending || !selectedId || !turnstileToken || amountCents <= 0}
      >
        {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
        {triggerLabel} {formatAmount(amountCents)}
      </Button>
    </div>
  );
}
