import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { components } from "../lib/api-types";
import UpfrontPaymentModal from "../components/UpfrontPaymentModal";
import PlaidLinkButton from "../components/PlaidLinkButton";

type Loan = components["schemas"]["Loan"] & {
  upfront_required?: number;
  upfront_amount?: number;
  upfront_paid?: number;
};

export default function DashboardPage() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [amount, setAmount] = useState("");
  const [termMonths, setTermMonths] = useState("");
  const [applyError, setApplyError] = useState("");
  const [bankConnected, setBankConnected] = useState(false);
  const [kycApproved, setKycApproved] = useState(false);
  const [payingLoan, setPayingLoan] = useState<Loan | null>(null);

  async function fetchLoans() {
    const { data } = await api.GET("/loans");
    if (data) setLoans(data.loans as Loan[]);
  }

  useEffect(() => {
    fetchLoans();
    (api.GET as Function)("/profile").then(
      ({ data }: { data?: { bankConnected?: boolean; kycStatus?: string } }) => {
        if (data) {
          setBankConnected(data.bankConnected ?? false);
          setKycApproved(data.kycStatus === "approved");
        }
      }
    );
  }, []);

  async function applyLoan(e: React.FormEvent) {
    e.preventDefault();
    setApplyError("");
    const { data, error } = await api.POST("/loans", {
      body: { amount: Number(amount), termMonths: Number(termMonths) },
    });
    if (error) {
      setApplyError("error" in error ? error.error : "Application failed");
      return;
    }
    if (data) {
      setAmount("");
      setTermMonths("");
      await fetchLoans();
    }
  }

  return (
    <div className="flex flex-col gap-6 p-8">
      <div className="flex gap-4 items-center">
        <h1 className="text-xl font-semibold">My Loans</h1>
        {!bankConnected ? (
          <PlaidLinkButton onConnected={() => setBankConnected(true)} />
        ) : (
          <span className="text-sm text-green-700">Bank connected ✓</span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {loans.length === 0 && <p className="text-gray-500">No loans yet.</p>}
        {loans.map((loan) => (
          <div key={loan.id} className="flex gap-6 items-center border p-3 flex-wrap">
            <span className="font-mono text-sm">{loan.id.slice(0, 8)}…</span>
            <span>${loan.amount.toLocaleString()}</span>
            <span>{loan.term_months} mo</span>
            <span>{loan.status}</span>
            <span className="text-sm text-gray-500">
              {new Date(loan.created_at).toLocaleDateString()}
            </span>
            {loan.upfront_required === 1 && (
              loan.upfront_paid === 1 ? (
                <span className="text-green-700 text-sm">Upfront paid ✓</span>
              ) : (
                <button
                  className="text-sm bg-amber-100 border border-amber-400 px-2 py-1 rounded"
                  onClick={() => setPayingLoan(loan)}
                >
                  Pay upfront ${loan.upfront_amount?.toFixed(2)}
                </button>
              )
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Apply for a loan</h2>
        {!kycApproved ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
            Identity verification required to apply for a loan.{" "}
            <Link to="/kyc" className="underline font-medium">
              Complete verification →
            </Link>
          </p>
        ) : (
          <form className="flex gap-3 items-end" onSubmit={applyLoan}>
            <div className="flex flex-col gap-1">
              <label className="text-sm">Amount ($)</label>
              <input
                type="number"
                placeholder="1000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                min="1"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm">Term (months)</label>
              <input
                type="number"
                placeholder="12"
                value={termMonths}
                onChange={(e) => setTermMonths(e.target.value)}
                required
                min="1"
              />
            </div>
            <button type="submit">Apply</button>
          </form>
        )}
        {applyError && <p className="text-red-600 text-sm">{applyError}</p>}
      </div>

      {payingLoan && (
        <UpfrontPaymentModal
          loanId={payingLoan.id}
          amount={payingLoan.upfront_amount ?? 0}
          onPaid={() => { setPayingLoan(null); fetchLoans(); }}
          onClose={() => setPayingLoan(null)}
        />
      )}
    </div>
  );
}
