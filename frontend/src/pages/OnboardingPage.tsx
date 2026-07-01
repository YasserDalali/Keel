import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DiditSdk } from "@didit-protocol/sdk-web";
import { apiUrl } from "../lib/api-base";
import PlaidLinkButton from "../components/PlaidLinkButton";

type Step = 1 | 2 | 3;

function completeOnboarding(navigate: ReturnType<typeof useNavigate>) {
  localStorage.setItem("onboarding_shown", "1");
  navigate("/dashboard");
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);

  // Step 1
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [nationalIdNumber, setNationalIdNumber] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  // Step 3
  const [consented, setConsented] = useState(false);
  const [kycStarting, setKycStarting] = useState(false);
  const [kycError, setKycError] = useState("");

  async function submitProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileError("");
    const token = localStorage.getItem("token");
    const res = await fetch(apiUrl("/profile"), {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ firstName, lastName, phone, address, nationalIdNumber }),
    });
    if (!res.ok) {
      const json = await res.json() as { error?: string };
      setProfileError(json.error ?? "Failed to save profile");
      setProfileSaving(false);
      return;
    }
    setProfileSaving(false);
    setStep(2);
  }

  async function startKyc() {
    setKycStarting(true);
    setKycError("");
    const token = localStorage.getItem("token");
    const res = await fetch(apiUrl("/kyc/session"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json() as { url?: string; error?: string; detail?: string };
    if (!res.ok || !json.url) {
      setKycError(json.error ?? json.detail ?? "Failed to start verification");
      setKycStarting(false);
      return;
    }
    DiditSdk.shared.onComplete = () => completeOnboarding(navigate);
    await DiditSdk.shared.startVerification({ url: json.url });
    setKycStarting(false);
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8">
      <div className="flex flex-col gap-6 w-full max-w-md">
        <div className="flex gap-3 text-sm text-gray-500">
          {(["Profile", "Bank", "Verification"] as const).map((label, i) => (
            <span key={label} className={step === i + 1 ? "font-semibold text-gray-900" : ""}>
              {i + 1}. {label}{i < 2 ? " →" : ""}
            </span>
          ))}
        </div>

        {step === 1 && (
          <form className="flex flex-col gap-4" onSubmit={submitProfile}>
            <h2 className="text-lg font-semibold">Your profile</h2>
            <p className="text-sm text-gray-600">Required to continue.</p>
            <div className="flex gap-3">
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-sm">First name</label>
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-sm">Last name</label>
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm">Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm">Address</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm">National ID number</label>
              <input value={nationalIdNumber} onChange={(e) => setNationalIdNumber(e.target.value)} required />
            </div>
            {profileError && <p className="text-red-600 text-sm">{profileError}</p>}
            <button type="submit" disabled={profileSaving}>
              {profileSaving ? "Saving…" : "Continue"}
            </button>
          </form>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">Connect your bank</h2>
            <p className="text-sm text-gray-600">
              Connecting a bank improves your loan eligibility score.
            </p>
            <PlaidLinkButton onConnected={() => setStep(3)} />
            <button
              className="text-sm underline text-gray-500 self-start"
              onClick={() => setStep(3)}
            >
              Skip for now
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">Identity verification</h2>
            <p className="text-sm text-gray-600">
              Verify your identity to unlock loan applications. You can do this later from the dashboard.
            </p>
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={consented}
                onChange={(e) => setConsented(e.target.checked)}
                className="mt-1"
              />
              <span>
                I consent to identity verification via Didit, including capture of my ID document
                and biometric liveness check, for KYC purposes.
              </span>
            </label>
            {kycError && <p className="text-red-600 text-sm">{kycError}</p>}
            <button onClick={startKyc} disabled={kycStarting || !consented}>
              {kycStarting ? "Opening verification…" : "Start Verification"}
            </button>
            <button
              className="text-sm underline text-gray-500 self-start"
              onClick={() => completeOnboarding(navigate)}
            >
              Skip for now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
