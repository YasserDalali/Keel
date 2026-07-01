import { useState, useCallback, useEffect } from "react";
import { usePlaidLink } from "react-plaid-link";
import { api } from "../lib/api";

export default function PlaidLinkButton({ onConnected }: { onConnected: (score: number) => void }) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [linkError, setLinkError] = useState("");

  useEffect(() => {
    api.POST("/plaid/link-token").then(({ data, error }) => {
      if (data) setLinkToken(data.linkToken);
      else setLinkError(error && "error" in error ? error.error : "Could not get link token");
    });
  }, []);

  const onSuccess = useCallback(
    async (publicToken: string) => {
      const { data, error } = await api.POST("/plaid/connect", { body: { publicToken } });
      if (data) onConnected(data.bankSafetyScore);
      else setLinkError(error && "error" in error ? error.error : "Exchange failed");
    },
    [onConnected]
  );

  const { open, ready } = usePlaidLink({ token: linkToken ?? "", onSuccess });

  if (linkError) return <span className="text-red-600 text-sm">{linkError}</span>;

  return (
    <button onClick={() => open()} disabled={!ready || !linkToken}>
      {linkToken ? "Connect Bank (Plaid)" : "Loading…"}
    </button>
  );
}
