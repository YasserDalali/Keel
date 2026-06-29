import { useEffect, useState } from "react";
import { DiditSdk } from "@didit-protocol/sdk-web";
import { api } from "../lib/api";

type KycStatus =
  | "pending" | "approved" | "declined"
  | "in_review" | "in_progress" | "abandoned"
  | "expired" | "resubmitted";

const STATUS_LABEL: Record<KycStatus, string> = {
  pending:     "Not started",
  in_progress: "In progress",
  in_review:   "Under review",
  resubmitted: "Resubmitted",
  approved:    "Approved ✓",
  declined:    "Declined",
  abandoned:   "Abandoned",
  expired:     "Expired",
};

const RESTARTABLE: KycStatus[] = ["pending", "expired", "abandoned", "declined"];

export default function KycPage() {
  const [status, setStatus] = useState<KycStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  async function fetchStatus() {
    const { data } = await api.GET("/profile" as never);
    if (data && (data as { kycStatus: KycStatus }).kycStatus) {
      setStatus((data as { kycStatus: KycStatus }).kycStatus);
    } else {
      setStatus("pending");
    }
    setLoading(false);
  }

  useEffect(() => { fetchStatus(); }, []);

  async function startVerification() {
    setStarting(true);
    setError("");

    const token = localStorage.getItem("token");
    const res = await fetch("/api/kyc/session", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json() as { verificationUrl?: string; error?: string };
    if (!res.ok || !json.verificationUrl) {
      setError(json.error ?? "Failed to start verification");
      setStarting(false);
      return;
    }

    DiditSdk.shared.onComplete = (result) => {
      setStarting(false);
      if (result.type === "completed") {
        // Webhook updates the DB asynchronously — refresh after a brief delay
        setStatus("in_progress");
        setTimeout(() => fetchStatus(), 3000);
      }
    };

    await DiditSdk.shared.startVerification({ url: json.verificationUrl });
  }

  if (loading) return <div className="p-8 text-gray-500">Loading…</div>;

  const canRestart = status && RESTARTABLE.includes(status);

  return (
    <div className="flex flex-col gap-4 p-8 max-w-md">
      <h1 className="text-xl font-semibold">Identity Verification</h1>

      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500">Status:</span>
        <span
          className={
            status === "approved" ? "text-green-700 font-medium" :
            status === "declined" ? "text-red-600 font-medium" :
            "text-gray-800 font-medium"
          }
        >
          {status ? STATUS_LABEL[status] : "Unknown"}
        </span>
      </div>

      {status === "approved" && (
        <p className="text-sm text-gray-600">
          Your identity has been verified. You can now apply for loans.
        </p>
      )}

      {status === "in_review" && (
        <p className="text-sm text-gray-600">
          Your documents are being reviewed. This usually takes a few minutes.
        </p>
      )}

      {status === "in_progress" && (
        <p className="text-sm text-gray-600">
          Verification in progress — result will arrive shortly.{" "}
          <button className="underline text-blue-600" onClick={fetchStatus}>Refresh</button>
        </p>
      )}

      {canRestart && (
        <div className="flex flex-col gap-2">
          {status !== "pending" && (
            <p className="text-sm text-gray-600">
              {status === "declined" && "Your verification was declined. You may try again."}
              {status === "expired"   && "Your previous session expired. Please start a new one."}
              {status === "abandoned" && "You did not complete the previous session."}
            </p>
          )}
          <button
            onClick={startVerification}
            disabled={starting}
            className="self-start"
          >
            {starting ? "Opening verification…" : "Start Verification"}
          </button>
        </div>
      )}

      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}
