"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n/provider";

const RESEND_SECONDS = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Stage = "email" | "code" | "verified";

async function post<T>(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  return { ok: res.ok, data };
}

/**
 * E-mail potwierdzany kodem przed zamówieniem — w samym formularzu, bez przechodzenia gdzie indziej.
 * Wpisujesz adres → „Wyślij kod” → 6 cyfr (wklejenie i autouzupełnienie SMS/e-mail działa) →
 * sprawdza się samo. Potwierdzony adres zostaje w ciasteczku sesji, więc przy kolejnym
 * zamówieniu tego kroku już nie ma. Pole `name="email"` trafia do formularza zamówienia.
 */
export function EmailVerify({ inputClassName, onVerifiedChange }: { inputClassName: string; onVerifiedChange: (email: string | null) => void }) {
  const { t, lang } = useLang();
  const reduced = useReducedMotion();
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState<string[]>(() => Array(6).fill(""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [devCode, setDevCode] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(0);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  // Już potwierdzony w tej przeglądarce? Od razu pokazujemy zielony stan.
  useEffect(() => {
    let alive = true;
    fetch("/api/account/session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { email: string | null } | null) => {
        if (!alive || !d?.email) return;
        setEmail(d.email);
        setStage("verified");
        onVerifiedChange(d.email);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [onVerifiedChange]);

  useEffect(() => {
    if (stage !== "code") return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [stage]);

  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const send = async () => {
    const value = email.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) return setError(t.errors.email);
    setBusy(true);
    setError("");
    const { ok, data } = await post<{ devCode?: string }>("/api/account/code", { email: value, lang }).catch(() => ({ ok: false, data: { error: t.common.somethingWrong } as { devCode?: string; error?: string } }));
    setBusy(false);
    if (!ok) return setError(data.error ?? t.common.somethingWrong);
    setEmail(value);
    setDevCode(data.devCode ?? "");
    setDigits(Array(6).fill(""));
    setResendAt(Date.now() + RESEND_SECONDS * 1000);
    setNow(Date.now());
    setStage("code");
    setTimeout(() => inputs.current[0]?.focus(), 60);
  };

  const verify = async (code: string) => {
    setBusy(true);
    setError("");
    const { ok, data } = await post("/api/account/verify", { email, code, lang }).catch(() => ({ ok: false, data: { error: t.common.somethingWrong } }));
    setBusy(false);
    if (!ok) {
      setError(data.error ?? t.common.somethingWrong);
      setDigits(Array(6).fill(""));
      inputs.current[0]?.focus();
      return;
    }
    setStage("verified");
    onVerifiedChange(email);
  };

  const fill = (from: number, raw: string) => {
    const incoming = raw.replace(/\D/g, "");
    if (!incoming) {
      setDigits((d) => d.map((v, i) => (i === from ? "" : v)));
      return;
    }
    const next = [...digits];
    let i = from;
    for (const ch of incoming) {
      if (i > 5) break;
      next[i++] = ch;
    }
    setDigits(next);
    inputs.current[Math.min(i, 5)]?.focus();
    if (next.every(Boolean) && !busy) verify(next.join(""));
  };

  const change = () => {
    setStage("email");
    setError("");
    onVerifiedChange(null);
  };

  return (
    <div className="grid gap-2">
      <span className="font-bold">{t.order.email}</span>
      {/* adres jedzie z formularzem niezależnie od kroku */}
      <input type="hidden" name="email" value={stage === "verified" ? email : ""} />

      <AnimatePresence mode="wait" initial={false}>
        {stage === "verified" ? (
          <motion.div
            key="ok"
            initial={reduced ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex min-h-14 items-center gap-3 rounded-2xl border-[2.5px] border-ink bg-basilico/30 px-4"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-basilico font-extrabold text-ink">✓</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-extrabold">{email}</span>
              <span className="block text-sm font-semibold opacity-75">{t.order.verified}</span>
            </span>
            <button type="button" onClick={change} className="text-sm font-bold underline underline-offset-4">
              {t.order.verifyChange}
            </button>
          </motion.div>
        ) : stage === "code" ? (
          <motion.div key="code" initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-2xl border-[2.5px] border-ink bg-giallo/40 p-3">
            <p className="text-sm font-bold break-words">{t.order.verifyCode(email)}</p>
            <div className="mt-2 grid grid-cols-6 gap-1.5">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    inputs.current[i] = el;
                  }}
                  value={d}
                  inputMode="numeric"
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  maxLength={i === 0 ? 6 : 1}
                  aria-label={t.order.verifyAria(i + 1)}
                  disabled={busy}
                  onChange={(e) => fill(i, e.target.value)}
                  onPaste={(e) => {
                    e.preventDefault();
                    fill(i, e.clipboardData.getData("text"));
                  }}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && !d && i > 0) inputs.current[i - 1]?.focus();
                  }}
                  className={`tabular h-12 w-full min-w-0 rounded-xl border-[2.5px] border-ink text-center text-xl font-extrabold focus:outline-none ${d ? "bg-paper" : "bg-paper/70"}`}
                />
              ))}
            </div>
            {devCode ? <p className="mt-2 text-xs font-bold opacity-70">{t.account.devCode(devCode)}</p> : null}
            <div className="mt-2 flex items-center justify-between text-sm font-bold">
              <button type="button" onClick={change} className="underline underline-offset-4">
                {t.order.verifyChange}
              </button>
              <button type="button" onClick={send} disabled={wait > 0 || busy} className="tabular underline underline-offset-4 disabled:no-underline disabled:opacity-50">
                {wait > 0 ? t.order.verifyResendIn(wait) : t.order.verifyResend}
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="email" initial={false} exit={{ opacity: 0 }} className="flex gap-2">
            <input
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  send();
                }
              }}
              aria-label={t.order.email}
              className={`${inputClassName} min-w-0 flex-1`}
            />
            <button type="button" onClick={send} disabled={busy} className="btn-3d btn-3d-sm h-12 shrink-0 rounded-2xl bg-ink px-4 font-extrabold text-paper disabled:opacity-60">
              {busy ? t.order.verifySending : t.order.verifySend}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {error ? (
        <p role="alert" className="text-sm font-bold text-pomodoro">
          {error}
        </p>
      ) : null}
    </div>
  );
}
