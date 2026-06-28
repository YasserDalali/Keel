import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { components } from "../lib/api-types";

type OcrSuggestions = components["schemas"]["OcrSuggestions"];

type ConfirmForm = {
  firstName: string;
  lastName: string;
  nationalIdNumber: string;
  phone: string;
  address: string;
};

export default function KycPage() {
  const [step, setStep] = useState<"upload" | "confirm">("upload");
  const [form, setForm] = useState<ConfirmForm>({
    firstName: "",
    lastName: "",
    nationalIdNumber: "",
    phone: "",
    address: "",
  });
  const [error, setError] = useState("");
  const navigate = useNavigate();

  function fromOcr(ocr: OcrSuggestions): Partial<ConfirmForm> {
    return {
      firstName: ocr.firstName ?? "",
      lastName: ocr.lastName ?? "",
      nationalIdNumber: ocr.nationalIdNumber ?? "",
    };
  }

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fileInput = e.currentTarget.elements.namedItem("file") as HTMLInputElement;
    if (!fileInput.files?.[0]) return;

    // openapi-fetch multipart type inference is limited; raw fetch is cleaner here
    const body = new FormData();
    body.append("file", fileInput.files[0]);
    const token = localStorage.getItem("token");
    const res = await fetch("/api/kyc/upload", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
    });

    const json = await res.json() as { suggestions?: OcrSuggestions; error?: string };
    if (!res.ok || !json.suggestions) {
      setError(json.error ?? "Upload failed");
      return;
    }

    setForm((f) => ({ ...f, ...fromOcr(json.suggestions!) }));
    setStep("confirm");
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const { error: err } = await api.POST("/kyc/confirm", { body: form });
    if (err) {
      setError("error" in err ? err.error : "Confirm failed");
      return;
    }
    navigate("/dashboard");
  }

  function field(key: keyof ConfirmForm) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value })),
    };
  }

  if (step === "upload") {
    return (
      <div className="flex flex-col gap-4 p-8">
        <h1 className="text-xl font-semibold">KYC — Upload ID</h1>
        <form className="flex flex-col gap-3" onSubmit={handleUpload}>
          <input name="file" type="file" accept="image/jpeg,image/png" required />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit">Upload</button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">KYC — Confirm Details</h1>
      <p className="text-sm text-gray-500">OCR pre-filled where possible. Review and complete.</p>
      <form className="flex flex-col gap-3 w-80" onSubmit={handleConfirm}>
        <input placeholder="First name" required {...field("firstName")} />
        <input placeholder="Last name" required {...field("lastName")} />
        <input placeholder="National ID number" required {...field("nationalIdNumber")} />
        <input placeholder="Phone" required {...field("phone")} />
        <input placeholder="Address" required {...field("address")} />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={() => setStep("upload")}>Back</button>
          <button type="submit">Confirm</button>
        </div>
      </form>
    </div>
  );
}
