import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { gsap, useGSAP, useReducedMotion, EASE_OUT } from "../lib/motion";
import { Button } from "../ui/Button";
import { TextField } from "../ui/TextField";
import { DemoFill } from "../ui/DemoFill";
import { Form } from "../ui/Form";
import { TextLink } from "../ui/TextLink";
import { Wordmark } from "../ui/Wordmark";
import { authMessage, type AuthMessage } from "./authErrors";

const COPY = {
  signin: {
    title: "Welcome back",
    intro: "Sign in to see your loan and your next payment.",
    submit: "Sign in",
    switchText: "New to Keel?",
    switchLink: { label: "Create an account", to: "/signup" },
    password: { autoComplete: "current-password", hint: undefined },
  },
  signup: {
    title: "Create your Keel account",
    intro: "Applying takes about ten minutes. You'll need an ID and online banking.",
    submit: "Create account",
    switchText: "Already have an account?",
    switchLink: { label: "Sign in", to: "/signin" },
    password: { autoComplete: "new-password", hint: "At least 8 characters" },
  },
} as const;

// ponytail: dev/demo only (DemoFill hides itself otherwise). Remembers the last generated demo account so sign-in can refill it.
const DEMO_KEY = "keel.demo-account";
const newDemoAccount = () => ({ email: `demo.${Date.now().toString(36)}@example.test`, password: `demo-${Math.random().toString(36).slice(2, 12)}` });
function lastDemoAccount(): Record<string, string> | null {
  try {
    return JSON.parse(localStorage.getItem(DEMO_KEY) ?? "null");
  } catch {
    return null;
  }
}

export default function AuthPage({ mode }: { mode: "signin" | "signup" }) {
  const copy = COPY[mode];
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<AuthMessage | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useGSAP(
    () => {
      if (reduced) return;
      gsap
        .timeline({ defaults: { ease: EASE_OUT } })
        .from("[data-art]", { clipPath: "inset(0% 0% 0% 100%)", duration: 1.2, ease: "expo.inOut" }, 0)
        .from("[data-art] img", { scale: 1.12, duration: 2.2 }, 0)
        .from("[data-enter]", { y: 16, autoAlpha: 0, duration: 0.6, stagger: 0.06 }, 0.15);
    },
    { scope: root, dependencies: [reduced, mode] },
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    setBusy(true);
    setMsg(null);
    try {
      await (mode === "signin" ? signIn : signUp)(email, password);
      navigate("/app");
    } catch (err) {
      const m = authMessage(err);
      setMsg(m);
      if (m.field) document.querySelector<HTMLInputElement>(`input[name="${m.field}"]`)?.focus();
    } finally {
      setBusy(false);
    }
  }

  const fieldError = (f: "email" | "password") =>
    msg?.field === f ? (
      <>
        {msg.text}{" "}
        {msg.action && <TextLink to={msg.action.to} className="font-medium">{msg.action.label}</TextLink>}
      </>
    ) : undefined;

  return (
    <div ref={root} className="grid min-h-dvh lg:grid-cols-12">
      <div className="flex flex-col px-6 py-6 sm:px-10 lg:col-span-6 xl:col-span-5 xl:px-16">
        <Link to="/" className="self-start rounded-control text-h3" data-enter>
          <Wordmark />
        </Link>

        <main className="flex flex-1 flex-col justify-center py-16">
          <div className="w-full max-w-[400px]">
            <h1 className="text-h1" data-enter>{copy.title}</h1>
            <p className="mt-4 text-body text-ink-2" data-enter>{copy.intro}</p>

            <Form className="mt-10 flex flex-col gap-6" onSubmit={onSubmit}>
              {mode === "signup" ? (
                <DemoFill label="Fill a new demo account" values={newDemoAccount} onFill={(v) => localStorage.setItem(DEMO_KEY, JSON.stringify(v))} />
              ) : (
                lastDemoAccount() && <DemoFill label="Fill your last demo account" values={() => lastDemoAccount() ?? {}} />
              )}
              <div data-enter>
                <TextField label="Email" name="email" type="email" required autoComplete="email" error={fieldError("email")} />
              </div>
              <div data-enter>
                <TextField
                  label="Password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete={copy.password.autoComplete}
                  hint={copy.password.hint}
                  error={fieldError("password")}
                />
              </div>
              {msg && !msg.field && (
                <p role="alert" className="text-small text-danger">{msg.text}</p>
              )}
              <div data-enter>
                <Button type="submit" size="lg" loading={busy} className="w-full">{copy.submit}</Button>
              </div>
            </Form>

            <p className="mt-8 text-body text-ink-2" data-enter>
              {copy.switchText}{" "}
              <TextLink to={copy.switchLink.to} className="font-medium text-ink">{copy.switchLink.label}</TextLink>
            </p>
          </div>
        </main>
      </div>

      <div data-art className="relative hidden overflow-hidden bg-mint-50 lg:col-span-6 lg:block xl:col-span-7">
        <img src="/img/auth-shop.webp" alt="" className="absolute inset-0 size-full object-cover object-[50%_70%]" />
      </div>
    </div>
  );
}
