import { Link } from "react-router";
import { Container } from "./Container";
import { Wordmark } from "./Wordmark";

const cols = [
  { title: "Product", links: [{ label: "How it works", href: "/#how" }, { label: "Rates", href: "/#rates" }] },
  { title: "Account", links: [{ label: "Sign in", to: "/signin" }, { label: "Create an account", to: "/signup" }] },
];

export function Footer() {
  return (
    <footer className="border-t border-line">
      <Container className="grid gap-12 py-16 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-6">
          <Link to="/" className="self-start rounded-control text-h3" aria-label="Keel home"><Wordmark /></Link>
          <p className="max-w-[36ch] text-small text-ink-2">Small loans for shops, workshops and market stalls.</p>
        </div>
        {cols.map((c) => (
          <div key={c.title} className="flex flex-col gap-3 lg:col-span-3">
            <h2 className="text-label text-ink-2">{c.title}</h2>
            <ul className="flex flex-col gap-2">
              {c.links.map((l) => (
                <li key={l.label}>
                  {"to" in l ? (
                    <Link to={l.to!} className="text-body hover:text-accent-700">{l.label}</Link>
                  ) : (
                    <a href={l.href} className="text-body hover:text-accent-700">{l.label}</a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="flex flex-col justify-between gap-2 border-t border-line pt-6 text-small text-ink-2 sm:flex-row lg:col-span-12">
          <p>Keel is a demonstration lending platform.</p>
          <p>© {new Date().getFullYear()} Keel</p>
        </div>
      </Container>
    </footer>
  );
}
