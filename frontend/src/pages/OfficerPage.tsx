import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { apiUrl } from "../lib/api-base";
import type { components } from "../lib/api-types";

type Loan = components["schemas"]["Loan"] & {
  risk_assessment_summary?: string;
  borrower_id: string;
};

type ProfileRecord = {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  address: string | null;
  nationalIdNumber: string | null;
  kycStatus: string;
};

type RiskSummary = {
  finalScore: number;
  bankSafety: number;
  behavior: number;
  weights: Record<string, number>;
  threshold: number;
};

export default function OfficerPage() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // "loading" = in-flight, null = failed/not-found, ProfileRecord = loaded; absent key = never fetched
  const [profiles, setProfiles] = useState<Record<string, "loading" | null | ProfileRecord>>({});

  async function fetchLoans() {
    const { data } = await api.GET("/loans", {
      params: { query: { status: "pending" } },
    });
    if (data) setLoans(data.loans as Loan[]);
  }

  useEffect(() => { fetchLoans(); }, []);

  async function loadProfile(borrowerId: string) {
    if (borrowerId in profiles) return; // already loading or loaded
    setProfiles((p) => ({ ...p, [borrowerId]: "loading" }));
    const token = localStorage.getItem("token");
    const res = await fetch(apiUrl(`/profile/${borrowerId}`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setProfiles((p) => ({ ...p, [borrowerId]: null }));
      return;
    }
    const { profile } = await res.json() as { profile: ProfileRecord };
    setProfiles((p) => ({ ...p, [borrowerId]: profile }));
  }

  function toggleExpand(loan: Loan) {
    const next = !expanded[loan.id];
    setExpanded((e) => ({ ...e, [loan.id]: next }));
    if (next) loadProfile(loan.borrower_id);
  }

  async function approve(id: string) {
    setError("");
    const { error: err } = await api.POST("/loans/{id}/approve", {
      params: { path: { id } },
    });
    if (err && "error" in err) { setError(err.error); return; }
    await fetchLoans();
  }

  async function reject(id: string) {
    setError("");
    const { error: err } = await api.POST("/loans/{id}/reject", {
      params: { path: { id } },
    });
    if (err && "error" in err) { setError(err.error); return; }
    await fetchLoans();
  }

  return (
    <div className="flex flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">Pending Loans</h1>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {loans.length === 0 && <p className="text-gray-500">No pending loans.</p>}
      {loans.map((loan) => {
        const isExpanded = expanded[loan.id];
        const profile = profiles[loan.borrower_id];
        const risk: RiskSummary | null = loan.risk_assessment_summary
          ? (JSON.parse(loan.risk_assessment_summary) as RiskSummary)
          : null;

        return (
          <div key={loan.id} className="border">
            <div className="flex gap-6 items-center p-3">
              <button
                onClick={() => toggleExpand(loan)}
                className="text-gray-400 text-xs w-4 shrink-0"
                aria-label={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? "▼" : "▶"}
              </button>
              <span className="font-mono text-sm">{loan.id.slice(0, 8)}…</span>
              <span>${loan.amount.toLocaleString()}</span>
              <span>{loan.term_months} mo</span>
              {loan.risk_assessment_score != null && (
                <span className="text-sm">risk: {loan.risk_assessment_score.toFixed(2)}</span>
              )}
              <span className="text-sm text-gray-500">
                {new Date(loan.created_at).toLocaleDateString()}
              </span>
              <div className="flex gap-2 ml-auto">
                <button onClick={() => approve(loan.id)}>Approve</button>
                <button onClick={() => reject(loan.id)}>Reject</button>
              </div>
            </div>

            {isExpanded && (
              <div className="border-t p-4 bg-gray-50 grid grid-cols-2 gap-6 text-sm">
                <div className="flex flex-col gap-2">
                  <p className="font-medium text-gray-700">Borrower Profile</p>
                  {profile === "loading" ? (
                    <p className="text-gray-400">Loading…</p>
                  ) : profile === null ? (
                    <p className="text-gray-400">No profile found</p>
                  ) : (
                    <dl className="flex flex-col gap-1">
                      {(
                        [
                          ["Name", `${profile.firstName ?? "—"} ${profile.lastName ?? ""}`.trim()],
                          ["Phone", profile.phone ?? "—"],
                          ["Address", profile.address ?? "—"],
                          ["National ID", profile.nationalIdNumber ?? "—"],
                          ["KYC status", profile.kycStatus],
                        ] as [string, string][]
                      ).map(([label, value]) => (
                        <div key={label} className="flex gap-2">
                          <dt className="text-gray-500 w-24 shrink-0">{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <p className="font-medium text-gray-700">Risk Breakdown</p>
                  {risk ? (
                    <dl className="flex flex-col gap-1">
                      {(
                        [
                          ["Final score", risk.finalScore.toFixed(2)],
                          ["Bank safety", risk.bankSafety.toFixed(2)],
                          ["Behaviour", risk.behavior.toFixed(2)],
                          ["Threshold", String(risk.threshold)],
                          ...Object.entries(risk.weights).map(([k, v]) => [
                            `w(${k})`, String(v),
                          ] as [string, string]),
                        ] as [string, string][]
                      ).map(([label, value]) => (
                        <div key={label} className="flex gap-2">
                          <dt className="text-gray-500 w-28 shrink-0">{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="text-gray-400">No risk data</p>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
