import { readiness, type Profile } from "./loans";

// ponytail: `bank` and `kycUpdatedAt` come from the extended GET /api/profile; optional so older APIs still render.
export type BankInfo = { institutionName: string | null; safetyScore: number; connectedAt: string | null };
export type ProfileView = Profile & { bank?: BankInfo | null; kycUpdatedAt?: string | null };

export type WizardStep = "profile" | "bank" | "identity" | "review";
export const WIZARD: { key: WizardStep; label: string }[] = [
  { key: "profile", label: "Your details" },
  { key: "bank", label: "Bank" },
  { key: "identity", label: "ID" },
  { key: "review", label: "Review" },
];

/** National ID shown as "•••• 6789": enough to recognise, not enough to copy. */
export function maskId(id: string | null | undefined) {
  if (!id) return "—";
  return id.length <= 4 ? "••••" : `•••• ${id.slice(-4)}`;
}

/** The three parts a borrower needs before applying, and the first one still missing. */
export function completeness(p: ProfileView) {
  const parts = readiness(p);
  const done = parts.filter((s) => s.done).length;
  return { parts, done, total: parts.length, next: (parts.find((s) => !s.done)?.key ?? null) as WizardStep | null };
}

/** Step to show: a valid ?step= wins, else the first unfinished part, else review. */
export function stepFrom(param: string | null, p: ProfileView): WizardStep {
  if (WIZARD.some((w) => w.key === param)) return param as WizardStep;
  return completeness(p).next ?? "review";
}

/** The demo shortcut stores this institution name; used to label demo data honestly. */
export const isDemoBank = (p: ProfileView) => p.bank?.institutionName === "Demo Bank";
