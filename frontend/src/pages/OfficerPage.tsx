import { useState, useEffect } from "react";
import { api } from "../lib/api";
import type { components } from "../lib/api-types";

type Loan = components["schemas"]["Loan"];

export default function OfficerPage() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [error, setError] = useState("");

  async function fetchLoans() {
    const { data } = await api.GET("/loans", {
      params: { query: { status: "pending" } },
    });
    if (data) setLoans(data.loans as Loan[]);
  }

  useEffect(() => { fetchLoans(); }, []);

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
      {loans.map((loan) => (
        <div key={loan.id} className="flex gap-6 items-center border p-3">
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
      ))}
    </div>
  );
}
