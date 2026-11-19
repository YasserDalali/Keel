import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { http, TOKEN_KEY, useLoad } from "../lib/api";
import { usd } from "../lib/format";
import { date, shortId } from "../lib/loans";
import { Button } from "../ui/Button";
import { Container } from "../ui/Container";
import { Segmented } from "../ui/Segmented";
import { Select } from "../ui/Select";
import { useToast } from "../ui/Toast";
import { LoadError, PageHead, PageSkeleton } from "./AppShell";

import { FALLBACK_TITLE, groupDocs, KIND_OF, titleOf, ymd, type Kind, type StatementDoc } from "./statements-data";
export { titleOf, type StatementDoc } from "./statements-data";

const monthName = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
const thisMonth = () => new Date().toISOString().slice(0, 7);

async function fetchPdf(id: string) {
  const res = await fetch(`/api/documents/${id}`, { headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` } });
  if (!res.ok) throw new Error("That document couldn't be opened. Try again.");
  return URL.createObjectURL(await res.blob());
}

/** Open a PDF that needs the auth header. The tab opens before the fetch so pop-up blockers allow it. */
export async function openPdf(id: string) {
  // ponytail: blob URLs are never revoked (one per click, freed when the tab closes).
  const tab = window.open("", "_blank");
  try {
    const url = await fetchPdf(id);
    if (tab) tab.location.href = url;
    else location.href = url;
  } catch (e) {
    tab?.close();
    alert((e as Error).message);
  }
}

export async function downloadPdf(id: string, name: string) {
  const url = await fetchPdf(id);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^\w\- ]+/g, "").trim() || "keel-document"}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const KINDS: { value: Kind; label: string }[] = [
  { value: "all", label: "All" },
  { value: "agreements", label: "Agreements" },
  { value: "receipts", label: "Receipts" },
  { value: "statements", label: "Statements" },
];

export default function Statements() {
  const { data, error, loading, reload } = useLoad(() => http<{ documents: StatementDoc[] }>("/documents"));
  const [params, setParams] = useSearchParams();
  const kind = (KINDS.some((k) => k.value === params.get("type")) ? params.get("type") : "all") as Kind;
  const loan = params.get("loan") ?? "";
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v && v !== "all") next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  if (loading && !data) return <PageSkeleton />;
  if (!data) return <LoadError message={error} />;

  const docs = data.documents;
  const loans = [...new Set(docs.map((d) => d.loanId).filter((l): l is string => !!l))];
  const groups = groupDocs(docs, kind, loan);
  const count = groups.reduce((n, y) => n + y.months.reduce((m, g) => m + g.docs.length, 0), 0);

  return (
    <Container className="flex flex-col gap-12 py-12 lg:gap-16 lg:py-16" data-stagger>
      <PageHead
        eyebrow="My statements"
        title="My statements"
        intro="Every agreement, receipt and statement Keel has issued you, in one place. Open one to read it or download a copy."
      />

      <GenerateStatement onDone={reload} />

      <section aria-labelledby="docs" className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <h2 id="docs" className="text-h2">All documents <span className="tabular text-h3 text-ink-3">{count}</span></h2>
          <div className="flex flex-wrap items-end gap-4">
            <Segmented label="Document type" value={kind} options={KINDS} onChange={(v) => set("type", v)} />
            {loans.length > 1 && (
              <Select label="Loan" className="w-48" value={loan} onChange={(e) => set("loan", e.target.value)}>
                <option value="">All loans</option>
                {loans.map((l) => <option key={l} value={l}>{shortId(l)}</option>)}
              </Select>
            )}
          </div>
        </div>

        {!docs.length ? (
          <p className="max-w-[56ch] border-t border-line pt-6 text-body text-ink-2">
            No documents yet. Your loan agreement arrives when a loan is approved, and a receipt follows every payment. You can also generate a monthly statement above.
          </p>
        ) : !count ? (
          <p className="border-t border-line pt-6 text-body text-ink-2">Nothing matches these filters.</p>
        ) : (
          <div className="flex flex-col gap-10">
            {groups.map((y) => (
              <div key={y.year} className="flex flex-col gap-6">
                <h3 className="tabular text-h3 text-ink-2">{y.year}</h3>
                {y.months.map((m) => (
                  <div key={m.month} className="flex flex-col">
                    <p className="pb-2 text-label text-ink-2">{monthName(m.month)}</p>
                    <ul>{m.docs.map((d) => <DocRow key={d.id} doc={d} />)}</ul>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </Container>
  );
}

function DocRow({ doc }: { doc: StatementDoc }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const title = titleOf(doc);
  async function download() {
    setBusy(true);
    try {
      await downloadPdf(doc.id, `${title} ${ymd(doc.createdAt)}`);
    } catch (e) {
      toast({ title: "Download failed", body: (e as Error).message, tone: "danger" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="grid grid-cols-[2.5rem_1fr] items-center gap-x-4 gap-y-3 border-t border-line py-4 last:border-b sm:grid-cols-[2.5rem_1fr_8rem_8rem_auto] sm:gap-y-4 sm:pl-2">
      <DocIcon type={doc.documentType} />
      <span className="flex min-w-0 flex-col">
        <span className="text-body font-medium sm:truncate">{title}</span>
        <span className="text-small text-ink-2">
          {date(doc.createdAt)} · PDF
          {doc.amount != null && <span className="tabular sm:hidden"> · {usd(doc.amount)}</span>}
          {doc.loanId && <> · <Link to={`/app/loans/${doc.loanId}`} className="hover:text-accent-700">Loan {shortId(doc.loanId)}</Link></>}
        </span>
      </span>
      <span className="tabular hidden text-right text-body sm:block">{doc.amount != null ? usd(doc.amount) : ""}</span>
      <span className="hidden text-small text-ink-2 sm:block">{FALLBACK_TITLE[doc.documentType] ?? ""}</span>
      {/* phones: actions sit under the title so it isn't truncated */}
      <span className="col-start-2 flex items-center gap-5 sm:col-start-auto sm:gap-2">
        <Button variant="secondary" onClick={() => openPdf(doc.id)}>Open</Button>
        <Button variant="ghost" loading={busy} onClick={download}>Download</Button>
      </span>
    </li>
  );
}

function GenerateStatement({ onDone }: { onDone: () => unknown }) {
  const toast = useToast();
  const [month, setMonth] = useState(thisMonth);
  const [busy, setBusy] = useState(false);
  async function generate() {
    setBusy(true);
    try {
      await http("/documents/statement", { method: "POST", json: { month } });
      toast({ title: "Statement ready", body: `${monthName(month)} is now in your documents.`, tone: "success" });
      await onDone();
    } catch (e) {
      toast({ title: "Couldn't create the statement", body: (e as Error).message, tone: "danger" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="gen" className="grid gap-6 rounded-art bg-surface p-6 shadow-float-1 sm:p-8 lg:grid-cols-12 lg:items-end">
      <div className="flex flex-col gap-2 lg:col-span-6">
        <h2 id="gen" className="text-h3">Monthly statement</h2>
        <p className="max-w-[48ch] text-body text-ink-2">Your loans, payments and balances for one month, as a PDF you can share with a supplier or bank.</p>
      </div>
      <div className="flex flex-wrap items-end gap-4 lg:col-span-6 lg:justify-end">
        <label className="flex flex-col gap-2">
          <span className="text-label text-ink-2">Month</span>
          <input
            type="month"
            value={month}
            max={thisMonth()}
            onChange={(e) => setMonth(e.target.value || thisMonth())}
            className="h-11 rounded-control border border-line bg-surface px-3 text-body text-ink transition-colors duration-150 hover:border-line-strong"
          />
        </label>
        <Button onClick={generate} loading={busy}>Generate statement</Button>
      </div>
    </section>
  );
}

/** Page glyph with a mark per kind: lines (agreement), tick (receipt), bars (statement). */
function DocIcon({ type }: { type: string }) {
  const kind = KIND_OF[type] ?? "agreements";
  return (
    <svg viewBox="0 0 32 32" aria-hidden className="size-8">
      <path d="M8 3h11l6 6v20H8z" fill="var(--color-mint-50)" stroke="var(--color-ink)" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M19 3v6h6" fill="none" stroke="var(--color-ink)" strokeWidth="1.3" strokeLinejoin="round" />
      {kind === "agreements" && <path d="M12 15h9M12 19h9M12 23h6" stroke="var(--color-accent-600)" strokeWidth="1.4" strokeLinecap="round" />}
      {kind === "receipts" && <path d="M12.5 19l3 3 5.5-6" fill="none" stroke="var(--color-accent-600)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
      {kind === "statements" && <path d="M12.5 24v-4M16.5 24v-8M20.5 24v-6" stroke="var(--color-accent-600)" strokeWidth="1.8" strokeLinecap="round" />}
    </svg>
  );
}
