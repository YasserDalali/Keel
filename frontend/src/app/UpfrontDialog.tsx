import { useMemo, useState, type FormEvent } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { http, useLoad } from "../lib/api";
import { usd } from "../lib/format";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Skeleton } from "../ui/Skeleton";

type Config = { stripePublishableKey: string; paypalClientId: string };
type Props = { loanId: string; amount: number; open: boolean; onClose: () => void; onPaid: () => void };

// Stripe's iframe can't read our CSS variables; these mirror tokens.css.
const CARD_STYLE = {
  base: { fontFamily: '"General Sans", system-ui, sans-serif', fontSize: "17px", color: "#14271f", "::placeholder": { color: "#78827c" } },
  invalid: { color: "#b42318" },
};
const FONTS = [{ cssSrc: "https://api.fontshare.com/v2/css?f[]=general-sans@400,500&display=swap" }];

export default function UpfrontDialog({ loanId, amount, open, onClose, onPaid }: Props) {
  const [method, setMethod] = useState<"card" | "paypal">("card");
  const { data: config, error } = useLoad(() => http<Config>("/config"));
  const stripe = useMemo(() => (config?.stripePublishableKey ? loadStripe(config.stripePublishableKey) : null), [config]);

  return (
    <Dialog open={open} onClose={onClose} title={`Pay your ${usd(amount)} deposit`}>
      <p className="text-body text-ink-2">
        Loans over $5,000 need 5% paid before the money is sent. A loan officer can approve your loan once it's paid.
      </p>

      <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-2 gap-2">
        {(["card", "paypal"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={method === m}
            onClick={() => setMethod(m)}
            className="h-11 rounded-control border text-body transition-colors duration-150 aria-checked:border-ink aria-checked:bg-canvas aria-[checked=false]:border-line aria-[checked=false]:text-ink-2 hover:border-line-strong"
          >
            {m === "card" ? "Card" : "PayPal"}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="text-body text-danger">Payments aren't available right now. {error}</p>}
      {!config && !error && <Skeleton className="h-28 w-full" />}

      {config && method === "card" && (
        stripe ? (
          <Elements stripe={stripe} options={{ fonts: FONTS }}>
            <CardForm loanId={loanId} amount={amount} onPaid={onPaid} />
          </Elements>
        ) : <p role="alert" className="text-body text-danger">Card payments aren't set up on this server.</p>
      )}

      {config && method === "paypal" && <PayPal loanId={loanId} clientId={config.paypalClientId} onPaid={onPaid} />}
    </Dialog>
  );
}

function CardForm({ loanId, amount, onPaid }: { loanId: string; amount: number; onPaid: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const card = elements?.getElement(CardElement);
    if (!stripe || !card) return;
    setBusy(true);
    setErr("");
    try {
      const { clientSecret, intentId } = await http<{ clientSecret: string; intentId: string }>("/payments/stripe/intent", { method: "POST", json: { loanId } });
      const { error } = await stripe.confirmCardPayment(clientSecret, { payment_method: { card } });
      if (error) throw new Error(error.message ?? "Your card was declined. Try another card.");
      await http("/payments/stripe/confirm", { method: "POST", json: { loanId, intentId } });
      onPaid();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-label text-ink-2">Card details</span>
        <div className="rounded-control border border-line bg-surface px-4 py-[14px] transition-colors duration-150 hover:border-line-strong focus-within:border-accent-600">
          <CardElement options={{ style: CARD_STYLE, hidePostalCode: true }} />
        </div>
        <p className="text-small text-ink-2">Test mode: use 4242 4242 4242 4242, any future date, any CVC.</p>
      </div>
      {err && <p role="alert" className="text-body text-danger">{err}</p>}
      <Button type="submit" size="lg" loading={busy} disabled={!stripe}>Pay {usd(amount)}</Button>
    </form>
  );
}

function PayPal({ loanId, clientId, onPaid }: { loanId: string; clientId: string; onPaid: () => void }) {
  const [err, setErr] = useState("");
  if (!clientId) return <p role="alert" className="text-body text-danger">PayPal isn't set up on this server.</p>;
  return (
    <div className="flex flex-col gap-3">
      {err && <p role="alert" className="text-body text-danger">{err}</p>}
      <PayPalScriptProvider options={{ clientId, currency: "USD" }}>
        <PayPalButtons
          style={{ layout: "horizontal", tagline: false, height: 48, shape: "rect", color: "black" }}
          createOrder={async () => (await http<{ orderId: string }>("/payments/paypal/order", { method: "POST", json: { loanId } })).orderId}
          onApprove={async ({ orderID }) => {
            try {
              await http("/payments/paypal/capture", { method: "POST", json: { loanId, orderId: orderID } });
              onPaid();
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
          onError={() => setErr("PayPal couldn't complete the payment. Try again or pay by card.")}
        />
      </PayPalScriptProvider>
    </div>
  );
}
