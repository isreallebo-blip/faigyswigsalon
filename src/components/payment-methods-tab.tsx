// Payment Methods tab on the client profile.
// Lists all vaulted cards for a client, supports set-default / remove,
// and provides an "Add card" form that vaults without charging.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Loader2, Plus, Trash2, Star, Lock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import {
  listClientPaymentMethods,
  saveNewCardFlow,
  setDefaultPaymentMethod,
  removePaymentMethod,
  getPaymentsConnectivity,
} from "@/lib/intuit.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { format } from "date-fns";

export function PaymentMethodsTab({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const connFn = useServerFn(getPaymentsConnectivity);
  const conn = useQuery({ queryKey: ["payments-conn"], queryFn: () => connFn() });

  const listFn = useServerFn(listClientPaymentMethods);
  const list = useQuery({
    queryKey: ["client-cards", clientId],
    queryFn: () => listFn({ data: { clientId } }),
  });

  const setDefaultFn = useServerFn(setDefaultPaymentMethod);
  const removeFn = useServerFn(removePaymentMethod);

  const setDefault = useMutation({
    mutationFn: (id: string) => setDefaultFn({ data: { paymentMethodId: id } }),
    onSuccess: () => {
      toast.success("Default card updated");
      qc.invalidateQueries({ queryKey: ["client-cards", clientId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => removeFn({ data: { paymentMethodId: id } }),
    onSuccess: () => {
      toast.success("Card removed");
      qc.invalidateQueries({ queryKey: ["client-cards", clientId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Remove failed"),
  });

  const [adding, setAdding] = useState(false);

  if (!conn.data?.connected && !conn.isLoading) {
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg">Saved cards</h3>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="gap-1">
            <Plus className="h-4 w-4" /> Add new card
          </Button>
        )}
      </div>

      {adding && (
        <AddCardForm
          clientId={clientId}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            qc.invalidateQueries({ queryKey: ["client-cards", clientId] });
          }}
        />
      )}

      {list.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : !list.data?.length ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            No saved cards — add one above.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {list.data.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex items-center justify-between gap-3 p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <CreditCard className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {c.card_brand ?? "Card"} ending in {c.last4 ?? "????"}
                      </span>
                      {c.is_default && (
                        <Badge variant="secondary" className="text-[10px]">Default</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.exp_month && c.exp_year
                        ? `Exp ${String(c.exp_month).padStart(2, "0")}/${String(c.exp_year).slice(-2)} · `
                        : ""}
                      Added {format(new Date(c.created_at), "MMM d, yyyy")}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {!c.is_default && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1"
                      onClick={() => setDefault.mutate(c.id)}
                      disabled={setDefault.isPending}
                    >
                      <Star className="h-3.5 w-3.5" /> Set default
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive gap-1"
                    onClick={() => {
                      if (
                        confirm(
                          `Remove ${c.card_brand ?? "card"} ending in ${c.last4 ?? "????"}? This cannot be undone.`,
                        )
                      ) {
                        remove.mutate(c.id);
                      }
                    }}
                    disabled={remove.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AddCardForm({
  clientId,
  onClose,
  onSaved,
}: {
  clientId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const saveFn = useServerFn(saveNewCardFlow);
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [name, setName] = useState("");
  const [zip, setZip] = useState("");
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
      return saveFn({
        data: {
          clientId,
          cardNumber: cardNumber.replace(/\s+/g, ""),
          expMonth: month,
          expYear: year,
          cvv: cvv.trim(),
          cardholderName: name.trim(),
          postalCode: zip.trim(),
          setDefault,
          turnstileToken,
        },
      });
    },
    onSuccess: () => {
      toast.success("Card saved");
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save card"),
  });

  const ready = !!turnstileToken && cardNumber && expiry && cvv && name && zip;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" /> Card data is sent over TLS, tokenized by
          QuickBooks, and never stored on our servers.
        </div>
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
              placeholder="12/28"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">CVV</Label>
            <Input inputMode="numeric" placeholder="123" value={cvv} onChange={(e) => setCvv(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Cardholder name</Label>
            <Input placeholder="Jane Doe" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Billing zip</Label>
            <Input
              inputMode="numeric"
              placeholder="10952"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <Checkbox checked={setDefault} onCheckedChange={(v) => setSetDefault(!!v)} />
          Make it the default card for this client
        </label>

        <TurnstileWidget onToken={setTurnstileToken} />

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={m.isPending}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => m.mutate()} disabled={!ready || m.isPending}>
            {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save card
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
