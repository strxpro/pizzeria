"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { FINAL_STATUSES, RESTAURANT } from "@/lib/data";
import { useMenu } from "@/lib/menu";
import { euro } from "@/lib/format";
import { useLang, useT } from "@/lib/i18n/provider";
import { useOrder } from "@/lib/order";
import type { PublicOrder } from "@/lib/order-types";
import { LangSwitch } from "./lang-switch";
import { Liquid } from "./liquid";
import { ART, PizzaArt } from "./pizza-art";
import { Mark } from "./preloader";

type AccountOrder = PublicOrder & { review: { rating: number; text: string; createdAt: string } | null };
type Phase = "loading" | "email" | "code" | "list";

const RESEND_SECONDS = 45;
const POLL_MS = 15_000;
const EASE = [0.16, 1, 0.3, 1] as const;

async function post<T>(url: string, body: unknown): Promise<{ ok: boolean; data: T & { error?: string } }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  return { ok: res.ok, data };
}

/**
 * „I miei ordini”: klient wpisuje e-mail, potwierdza go 6-cyfrowym kodem
 * i widzi wszystkie swoje zamówienia — w toku, zakończone i odrzucone.
 * Przy zakończonych może od razu zostawić opinię (oznaczoną jako zweryfikowana)
 * albo zamówić to samo jeszcze raz.
 */
export function MyOrders() {
  const t = useT();
  const { lang } = useLang();
  const [phase, setPhase] = useState<Phase>("loading");
  const [email, setEmail] = useState("");
  const [account, setAccount] = useState<{ email: string; orders: AccountOrder[] } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/account/orders", { cache: "no-store" }).catch(() => null);
    if (res?.ok) {
      setAccount((await res.json()) as { email: string; orders: AccountOrder[] });
      setPhase("list");
      return true;
    }
    if (res?.status === 401) setPhase((p) => (p === "loading" || p === "list" ? "email" : p));
    return false;
  }, []);

  useEffect(() => {
    const id = setTimeout(load);
    return () => clearTimeout(id);
  }, [load]);

  // Zamówienia w toku odświeżamy co kilkanaście sekund.
  const hasActive = account?.orders.some((o) => !FINAL_STATUSES.includes(o.status)) ?? false;
  useEffect(() => {
    if (phase !== "list" || !hasActive) return;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [phase, hasActive, load]);

  const logout = async () => {
    await fetch("/api/account/logout", { method: "POST" }).catch(() => null);
    setAccount(null);
    setPhase("email");
  };

  return (
    <main className="relative isolate min-h-[100svh] overflow-hidden bg-giallo pb-24">
      <Liquid
        layers={[
          { color: "#ffe38a", x: -25, y: 5, size: 80, seed: 71, duration: 22 },
          { color: "#ffb326", x: 60, y: 50, size: 70, seed: 72, duration: 26, opacity: 0.8 },
        ]}
      />

      <header className="container-page flex h-20 items-center justify-between gap-2">
        <Link href="/" className="btn-3d btn-3d-sm flex h-11 items-center gap-2 rounded-full bg-paper pr-4 pl-1 font-extrabold">
          <Mark className="size-8" />
          <span className="max-sm:hidden">{RESTAURANT.name}</span>
        </Link>
        <div className="flex items-center gap-2">
          <LangSwitch />
          {phase === "list" ? (
            <button type="button" onClick={logout} className="btn-3d btn-3d-sm flex h-11 items-center rounded-full bg-paper px-4 text-sm font-bold">
              {t.account.logout}
            </button>
          ) : (
            <a href={RESTAURANT.phoneHref} className="btn-3d btn-3d-sm flex h-11 items-center rounded-full bg-ink px-5 text-sm font-bold text-paper">
              {t.common.call}
            </a>
          )}
        </div>
      </header>

      <div className="container-page pt-6 lg:pt-12">
        <AnimatePresence mode="wait" initial={false}>
          {phase === "loading" ? (
            <motion.div key="loading" exit={{ opacity: 0 }} className="flex justify-center py-32" aria-busy>
              <Mark className="size-16 animate-spin [animation-duration:1.6s]" />
            </motion.div>
          ) : phase === "email" ? (
            <Step key="email">
              <EmailStep
                email={email}
                setEmail={setEmail}
                lang={lang}
                onSent={() => setPhase("code")}
              />
            </Step>
          ) : phase === "code" ? (
            <Step key="code">
              <CodeStep email={email} lang={lang} onBack={() => setPhase("email")} onVerified={load} />
            </Step>
          ) : account ? (
            <Step key="list" wide>
              <OrderList account={account} reload={load} />
            </Step>
          ) : null}
        </AnimatePresence>
      </div>
    </main>
  );
}

function Step({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? undefined : { opacity: 0, y: -24 }}
      transition={{ duration: 0.45, ease: EASE }}
      className={wide ? "" : "mx-auto max-w-xl"}
    >
      {children}
    </motion.div>
  );
}

/* ——— krok 1: e-mail ——— */

const devCodes = new Map<string, string>();
let resendAt = 0;

function EmailStep({ email, setEmail, lang, onSent }: { email: string; setEmail: (v: string) => void; lang: string; onSent: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { ok, data } = await post<{ devCode?: string }>("/api/account/code", { email, lang }).catch(() => ({ ok: false, data: { error: t.common.somethingWrong } as { devCode?: string; error?: string } }));
    setBusy(false);
    if (!ok) return setError(data.error ?? t.common.somethingWrong);
    if (data.devCode) devCodes.set(email.trim().toLowerCase(), data.devCode);
    resendAt = Date.now() + RESEND_SECONDS * 1000;
    onSent();
  };

  return (
    <div>
      <h1 className="text-[clamp(3rem,9vw,6.5rem)] leading-[0.86] font-extrabold tracking-tight">{t.account.title}</h1>
      <p className="mt-5 text-xl leading-snug font-semibold">{t.account.lead}</p>

      <form onSubmit={submit} className="mt-8 rounded-[2rem] border-[2.5px] border-ink bg-paper p-5 shadow-[0_8px_0_var(--color-ink)] sm:p-7">
        <label className="grid gap-2">
          <span className="font-bold">{t.account.email}</span>
          <input
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nome@email.it"
            className="h-14 rounded-2xl border-[2.5px] border-ink bg-paper px-4 text-lg font-semibold placeholder:text-ink/40"
          />
        </label>
        {error ? (
          <p role="alert" className="mt-3 font-bold text-pomodoro">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={busy} className="btn-3d mt-5 flex h-14 w-full items-center justify-center rounded-full bg-pomodoro text-lg font-extrabold">
          {busy ? t.account.sending : t.account.sendCode}
        </button>
      </form>
    </div>
  );
}

/* ——— krok 2: kod ——— */

function CodeStep({ email, lang, onBack, onVerified }: { email: string; lang: string; onBack: () => void; onVerified: () => Promise<boolean> }) {
  const t = useT();
  const reduced = useReducedMotion();
  const [digits, setDigits] = useState<string[]>(() => Array(6).fill(""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [devCode, setDevCode] = useState(() => devCodes.get(email.trim().toLowerCase()));
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputs.current[0]?.focus();
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const verify = async (code: string) => {
    setBusy(true);
    setError("");
    const { ok, data } = await post("/api/account/verify", { email, code, lang }).catch(() => ({ ok: false, data: { error: t.common.somethingWrong } }));
    if (ok && (await onVerified())) return;
    setBusy(false);
    setError(data.error ?? t.common.somethingWrong);
    setShake((n) => n + 1);
    setDigits(Array(6).fill(""));
    inputs.current[0]?.focus();
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

  const resend = async () => {
    setError("");
    const { ok, data } = await post<{ devCode?: string }>("/api/account/code", { email, lang }).catch(() => ({ ok: false, data: { error: t.common.somethingWrong } as { devCode?: string; error?: string } }));
    if (!ok) return setError(data.error ?? t.common.somethingWrong);
    if (data.devCode) setDevCode(data.devCode);
    resendAt = Date.now() + RESEND_SECONDS * 1000;
    setNow(Date.now());
  };

  return (
    <div>
      <h1 className="text-[clamp(2.6rem,8vw,5.5rem)] leading-[0.88] font-extrabold tracking-tight">{t.account.codeTitle}</h1>
      <p className="mt-5 text-xl leading-snug font-semibold break-words">{t.account.codeLead(email)}</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (digits.every(Boolean)) verify(digits.join(""));
        }}
        className="mt-8 rounded-[2rem] border-[2.5px] border-ink bg-paper p-5 shadow-[0_8px_0_var(--color-ink)] sm:p-7"
      >
        <motion.div
          key={shake}
          animate={shake && !reduced ? { x: [0, -12, 10, -8, 6, 0] } : undefined}
          transition={{ duration: 0.4 }}
          className="grid grid-cols-6 gap-2 sm:gap-3"
        >
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
              aria-label={t.account.codeAria(i + 1)}
              disabled={busy}
              onChange={(e) => fill(i, e.target.value)}
              onPaste={(e) => {
                e.preventDefault();
                fill(i, e.clipboardData.getData("text"));
              }}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !d && i > 0) inputs.current[i - 1]?.focus();
                if (e.key === "ArrowLeft" && i > 0) inputs.current[i - 1]?.focus();
                if (e.key === "ArrowRight" && i < 5) inputs.current[i + 1]?.focus();
              }}
              className={`tabular aspect-[4/5] w-full min-w-0 rounded-2xl border-[2.5px] border-ink text-center text-[clamp(1.6rem,6vw,2.6rem)] font-extrabold transition-[background-color,translate] duration-150 focus:-translate-y-1 focus:outline-none ${
                d ? "bg-giallo" : "bg-paper"
              }`}
            />
          ))}
        </motion.div>

        {error ? (
          <p role="alert" className="mt-4 font-bold text-pomodoro">
            {error}
          </p>
        ) : null}
        {devCode ? <p className="mt-4 rounded-2xl bg-cielo/60 px-4 py-2 text-sm font-bold">{t.account.devCode(devCode)}</p> : null}

        <button type="submit" disabled={busy || !digits.every(Boolean)} className="btn-3d mt-5 flex h-14 w-full items-center justify-center rounded-full bg-pomodoro text-lg font-extrabold disabled:opacity-60">
          {busy ? t.account.verifying : t.account.verify}
        </button>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm font-bold">
          <button type="button" onClick={onBack} className="underline underline-offset-4">
            {t.account.changeEmail}
          </button>
          <button type="button" onClick={resend} disabled={wait > 0} className="tabular underline underline-offset-4 disabled:no-underline disabled:opacity-50">
            {wait > 0 ? t.account.resendIn(wait) : t.account.resend}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ——— krok 3: lista ——— */

function OrderList({ account, reload }: { account: { email: string; orders: AccountOrder[] }; reload: () => Promise<boolean> }) {
  const t = useT();
  const groups = useMemo(() => {
    const active = account.orders.filter((o) => !FINAL_STATUSES.includes(o.status));
    const done = account.orders.filter((o) => o.status === "consegnato" || o.status === "ritirato");
    const rejected = account.orders.filter((o) => o.status === "rifiutato");
    return [
      ["active", t.account.active, active],
      ["done", t.account.done, done],
      ["rejected", t.account.rejected, rejected],
    ] as const;
  }, [account.orders, t]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[clamp(3rem,9vw,6.5rem)] leading-[0.86] font-extrabold tracking-tight">{t.account.title}</h1>
          <p className="mt-3 text-lg font-bold break-all">{account.email}</p>
        </div>
        <Link href="/#menu" className="btn-3d flex h-14 items-center rounded-full bg-pomodoro px-6 text-lg font-extrabold">
          {t.order.seeMenu}
        </Link>
      </div>

      {account.orders.length === 0 ? (
        <div className="mt-10 rounded-[2rem] border-[2.5px] border-ink bg-paper p-8 text-center shadow-[0_8px_0_var(--color-ink)]">
          <p className="text-2xl font-extrabold">{t.account.none}</p>
        </div>
      ) : (
        groups.map(([key, label, orders]) =>
          orders.length ? (
            <section key={key} aria-labelledby={`g-${key}`} className="mt-12">
              <h2 id={`g-${key}`} className="flex items-center gap-3 text-2xl font-extrabold">
                {label}
                <span className="tabular flex size-9 items-center justify-center rounded-full bg-ink text-base text-giallo">{orders.length}</span>
              </h2>
              <ul className="mt-5 grid gap-6 lg:grid-cols-2">
                {orders.map((o, i) => (
                  <OrderCard key={o.id} order={o} index={i} reload={reload} />
                ))}
              </ul>
            </section>
          ) : null,
        )
      )}
    </div>
  );
}

function OrderCard({ order, index, reload }: { order: AccountOrder; index: number; reload: () => Promise<boolean> }) {
  const t = useT();
  const reduced = useReducedMotion();
  const router = useRouter();
  const cart = useOrder();
  const final = FINAL_STATUSES.includes(order.status);
  const rejected = order.status === "rifiutato";
  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(t.lang.locale, { timeZone: "Europe/Rome", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }),
    [t.lang.locale],
  );
  const { items: menuItems } = useMenu();
  const art = order.lines.map((l) => menuItems.find((i) => i.id === l.id)?.art).find(Boolean);
  const chip = rejected ? "bg-rosa" : final ? "bg-basilico" : "bg-pomodoro";

  return (
    <motion.li
      initial={reduced ? false : { opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE, delay: Math.min(index, 6) * 0.05 }}
      className={`relative flex flex-col rounded-[2rem] border-[2.5px] border-ink p-5 shadow-[0_8px_0_var(--color-ink)] sm:p-6 ${rejected ? "bg-paper/80" : "bg-paper"}`}
    >
      {art ? (
        <PizzaArt {...ART[art]} className="pointer-events-none absolute -top-6 -right-3 w-24 rotate-12 drop-shadow-[0_10px_10px_rgb(60_10_0/0.25)] sm:w-28" />
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pr-20">
        <span className={`inline-flex items-center gap-2 rounded-full border-2 border-ink px-3 py-1 text-sm font-extrabold ${chip}`}>
          {!final ? <span className="size-2 animate-pulse rounded-full bg-ink" /> : null}
          {t.status[order.status].short}
        </span>
        <span className="font-hand text-xl">#{order.id.slice(0, 6).toUpperCase()}</span>
      </div>
      <p className="mt-2 text-sm font-bold opacity-70">{t.account.placed(dateFmt.format(new Date(order.createdAt)))}</p>

      <ul className="mt-4 grid gap-1 border-y-2 border-dashed border-ink/60 py-3 font-semibold">
        {order.lines.map((l) => (
          <li key={l.id} className="flex justify-between gap-3">
            <span>
              <span className="tabular font-extrabold">{l.qty}×</span> {l.name}
            </span>
            <span className="tabular">{euro(l.price * l.qty)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-baseline justify-between text-lg font-extrabold">
        <span>{order.mode === "domicilio" ? t.order.homeDelivery : t.order.pickup}</span>
        <span className="tabular text-2xl">{euro(order.total)}</span>
      </p>
      {rejected && order.rejectReason ? <p className="mt-2 font-bold text-pomodoro">{t.tracking.reason(order.rejectReason)}</p> : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <Link href={`/ordine/${order.id}`} className={`btn-3d btn-3d-sm flex h-11 items-center rounded-full px-5 text-sm font-extrabold ${final ? "bg-paper" : "bg-ink text-paper"}`}>
          {t.account.track}
        </Link>
        <button
          type="button"
          onClick={() => {
            cart.reorder(order.lines);
            cart.setMode(order.mode);
            cart.setOpen(true);
            router.push("/");
          }}
          className="btn-3d btn-3d-sm flex h-11 items-center rounded-full bg-giallo px-5 text-sm font-extrabold"
        >
          {t.account.reorder}
        </button>
      </div>

      {final && !rejected ? <OrderReview order={order} reload={reload} /> : null}
    </motion.li>
  );
}

function OrderReview({ order, reload }: { order: AccountOrder; reload: () => Promise<boolean> }) {
  const t = useT();
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [thanks, setThanks] = useState(false);
  const shown = hover || rating;

  if (order.review) {
    return (
      <div className="mt-5 rounded-[1.5rem] bg-giallo/60 p-4">
        <p className="text-sm font-bold">
          {t.account.yourReview}
          {thanks ? <span className="ml-2">· {t.account.reviewThanks}</span> : null}
        </p>
        <p className="mt-1 text-xl tracking-widest" aria-label={t.common.starsAria(order.review.rating)}>
          <span aria-hidden>
            {"★".repeat(order.review.rating)}
            <span className="opacity-25">{"★".repeat(5 - order.review.rating)}</span>
          </span>
        </p>
        {order.review.text ? <p className="mt-1 font-semibold">&ldquo;{order.review.text}&rdquo;</p> : null}
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!rating) return setError(t.reviews.pickFirst);
    setBusy(true);
    setError("");
    const { ok, data } = await post("/api/account/review", { orderId: order.id, rating, text, lang }).catch(() => ({ ok: false, data: { error: t.reviews.failed } }));
    if (!ok) {
      setBusy(false);
      return setError(data.error ?? t.reviews.failed);
    }
    setThanks(true);
    await reload();
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-3d btn-3d-sm mt-5 flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-5 font-extrabold text-paper">
        <span className="text-giallo">★</span> {t.reviews.leave}
      </button>
    );
  }

  return (
    <motion.form
      onSubmit={submit}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="mt-5 rounded-[1.5rem] border-[2.5px] border-ink bg-paper p-4"
    >
      <p className="font-extrabold">{rating && rating <= 3 ? t.reviews.wrong : t.account.reviewThis}</p>
      <div role="radiogroup" aria-label={t.reviews.starsLabel} className="mt-2 flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={t.reviews.star(n)}
            onMouseEnter={() => setHover(n)}
            onClick={() => setRating(n)}
            className={`text-[2.3rem] leading-none transition-[scale,color] duration-150 hover:scale-125 ${n <= shown ? "text-giallo [text-shadow:0_3px_0_var(--color-ink)]" : "text-ink/20"}`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={1000}
        aria-label={t.reviews.how}
        placeholder={t.reviews.placeholder}
        className="mt-3 w-full resize-none rounded-2xl border-[2.5px] border-ink bg-paper px-4 py-3 font-semibold placeholder:text-ink/45"
      />
      {error ? (
        <p role="alert" className="mt-2 font-bold text-pomodoro">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className="btn-3d btn-3d-sm flex h-12 items-center rounded-full bg-giallo px-5 font-extrabold">
          {busy ? t.reviews.sending : t.account.reviewSend}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm font-bold underline underline-offset-4">
          {t.common.close}
        </button>
      </div>
    </motion.form>
  );
}
