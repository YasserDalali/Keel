import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { api } from "../lib/api";

type Props = {
  loanId: string;
  amount: number;
  onPaid: () => void;
  onClose: () => void;
};

type Config = { stripePublishableKey: string; paypalClientId: string };

// Inner Stripe form — lives inside <Elements> so it can call useStripe()
function StripeForm({ loanId, amount, onPaid }: { loanId: string; amount: number; onPaid: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError("");

    const res = await fetch("/api/payments/stripe/intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({ loanId }),
    });
    const { clientSecret, intentId, error: apiErr } = await res.json() as {
      clientSecret?: string; intentId?: string; error?: string;
    };
    if (apiErr || !clientSecret) { setError(apiErr ?? "Failed to create payment intent"); setLoading(false); return; }

    const card = elements.getElement(CardElement);
    if (!card) { setLoading(false); return; }

    const { error: stripeErr } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card },
    });
    if (stripeErr) { setError(stripeErr.message ?? "Payment failed"); setLoading(false); return; }

    const confirmRes = await fetch("/api/payments/stripe/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({ loanId, intentId }),
    });
    if (!confirmRes.ok) { setError("Payment confirmed but server update failed"); setLoading(false); return; }

    onPaid();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-sm text-gray-600">Sandbox card: 4242 4242 4242 4242 · any future date · any CVC</p>
      <div className="border p-3 rounded">
        <CardElement options={{ style: { base: { fontSize: "16px" } } }} />
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button type="submit" disabled={!stripe || loading}>
        {loading ? "Processing…" : `Pay $${amount.toFixed(2)} with Stripe`}
      </button>
    </form>
  );
}

export default function UpfrontPaymentModal({ loanId, amount, onPaid, onClose }: Props) {
  const [tab, setTab] = useState<"stripe" | "paypal">("stripe");
  const [config, setConfig] = useState<Config | null>(null);
  const [ppError, setPpError] = useState("");

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then((d) => setConfig(d as Config));
  }, []);

  async function createPayPalOrder() {
    const res = await fetch("/api/payments/paypal/order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({ loanId }),
    });
    const { orderId, error: apiErr } = await res.json() as { orderId?: string; error?: string };
    if (apiErr || !orderId) { setPpError(apiErr ?? "Failed to create order"); return ""; }
    return orderId;
  }

  async function capturePayPalOrder(data: { orderID: string }) {
    const res = await fetch("/api/payments/paypal/capture", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({ loanId, orderId: data.orderID }),
    });
    if (!res.ok) { setPpError("Capture failed"); return; }
    onPaid();
  }

  if (!config) return null;

  const stripePromise = loadStripe(config.stripePublishableKey);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded shadow-lg p-6 w-full max-w-md flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">Pay upfront deposit — ${amount.toFixed(2)}</h2>
          <button onClick={onClose} className="text-gray-500 text-xl">&times;</button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setTab("stripe")}
            className={tab === "stripe" ? "font-semibold underline" : "text-gray-500"}
          >
            Stripe
          </button>
          <button
            onClick={() => setTab("paypal")}
            className={tab === "paypal" ? "font-semibold underline" : "text-gray-500"}
          >
            PayPal
          </button>
        </div>

        {tab === "stripe" && (
          <Elements stripe={stripePromise}>
            <StripeForm loanId={loanId} amount={amount} onPaid={onPaid} />
          </Elements>
        )}

        {tab === "paypal" && (
          <div className="flex flex-col gap-2">
            {ppError && <p className="text-red-600 text-sm">{ppError}</p>}
            <PayPalScriptProvider options={{ clientId: config.paypalClientId, currency: "USD" }}>
              <PayPalButtons
                createOrder={createPayPalOrder}
                onApprove={capturePayPalOrder}
                onError={(err) => setPpError(String(err))}
                style={{ layout: "horizontal", tagline: false }}
              />
            </PayPalScriptProvider>
          </div>
        )}
      </div>
    </div>
  );
}
