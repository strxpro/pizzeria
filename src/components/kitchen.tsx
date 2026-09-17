"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ORDER_FLOW, RESTAURANT, type OrderStatus } from "@/lib/data";
import { euro } from "@/lib/format";
import type { Order } from "@/lib/order-types";
import type { Feedback, FeedbackAction } from "@/lib/server/feedback";
import type { Customer } from "@/lib/server/orders";
import { CardIcon, CashIcon } from "./payment-picker";
import { AdminMenu } from "./admin-menu";
import { HoursPanel, ShopStatusBar, useShopSettings } from "./admin-shop";
import { Mark } from "./preloader";
import { RouteMap } from "./route-map";

const KEY_STORAGE = "pizzeria-admin-key";
const SHARE_STORAGE = "pizzeria-share-";
const timeFmt = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" });
const dateFmt = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short" });

/** Trzy etapy pracy + zamknięte. */
type StageId = "nowe" | "przyjete" | "droga";
const STAGES: { id: StageId; step: number; title: string; hint: string; statuses: OrderStatus[]; tone: string }[] = [
  { id: "nowe", step: 1, title: "Nuovi", hint: "Accetta o rifiuta", statuses: ["ricevuto"], tone: "bg-pomodoro" },
  { id: "przyjete", step: 2, title: "Accettati", hint: "Prepara e parti", statuses: ["accettato"], tone: "bg-giallo" },
  { id: "droga", step: 3, title: "In viaggio", hint: "Consegna o fai ritirare", statuses: ["in_viaggio", "pronto"], tone: "bg-cielo" },
];
const CLOSED: OrderStatus[] = ["consegnato", "ritirato", "rifiutato"];

const STATUS_LABEL: Record<OrderStatus, string> = {
  ricevuto: "Nuovo",
  accettato: "Accettato",
  in_viaggio: "In viaggio",
  pronto: "Pronto al banco",
  consegnato: "Consegnato",
  ritirato: "Ritirato",
  rifiutato: "Annullato",
};

const REJECT_REASONS = ["Siamo al completo", "Indirizzo fuori zona", "Ingrediente finito", "Stiamo chiudendo"];

function readKey() {
  try {
    return sessionStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

// JSON dostaje nagłówek sam; FormData (zdjęcia) — nie, przeglądarka ustawia granice multipart.
const adminFetch = (url: string, init: RequestInit = {}) =>
  fetch(url, {
    ...init,
    cache: "no-store",
    headers: { ...(typeof init.body === "string" ? { "Content-Type": "application/json" } : {}), "x-kitchen-key": readKey(), ...init.headers },
  });

/**
 * Dzwonek na nowe zamówienie. Przeglądarki nie grają dźwięku, dopóki ktoś nie dotknie strony,
 * więc kontekst audio budzimy przy pierwszym kliknięciu/dotknięciu i trzymamy jeden na stałe.
 * Do tego wibracja na telefonie.
 */
function useChime() {
  const ctx = useRef<AudioContext | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unlock = () => {
      try {
        ctx.current ??= new AudioContext();
        ctx.current.resume().then(() => setReady(ctx.current?.state === "running"));
      } catch {
        /* brak Web Audio */
      }
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const play = useCallback(() => {
    navigator.vibrate?.([120, 80, 120]);
    const ac = ctx.current;
    if (!ac || ac.state !== "running") return;
    // Ciepły, niski „dzwonek” jak marimba: wznosząca się tercja C5–E5–G5, czysty sinus
    // z cichym alikwotem, miękki atak i długie wybrzmienie przez filtr dolnoprzepustowy.
    const out = ac.createBiquadFilter();
    out.type = "lowpass";
    out.frequency.value = 2200;
    const master = ac.createGain();
    master.gain.value = 0.9;
    out.connect(master).connect(ac.destination);
    [
      [523.25, 0],
      [659.25, 0.14],
      [783.99, 0.28],
    ].forEach(([freq, at]) => {
      const start = ac.currentTime + at;
      [
        [freq, 0.22],
        [freq * 2, 0.04],
      ].forEach(([f, level]) => {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = "sine";
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(level, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.4);
        osc.connect(gain).connect(out);
        osc.start(start);
        osc.stop(start + 1.45);
      });
    });
  }, []);

  return { play, ready };
}

/**
 * Panel admina (`/admin`) — celowo prosty, pod telefon w kuchni i w samochodzie.
 *
 * Zamówienie przechodzi trzy etapy, każdy z jednym dużym przyciskiem:
 * 1) Nowe → „Akceptuj” / „Odrzuć”, 2) Przyjęte → „Jadę” (albo „Gotowe do odbioru”),
 * 3) W drodze → mapa z trasą, „Nawiguj” i „Dostarczone”. Po „Jadę” telefon wysyła
 * pozycję GPS, więc klient widzi dostawcę na mapie na żywo.
 *
 * Nowe zamówienie = dzwonek, wibracja i licznik w tytule karty; na telefon lokalu
 * idzie też powiadomienie Pushover (po stronie serwera). Klucz (`KITCHEN_KEY`)
 * żyje tylko w sessionStorage tej karty.
 */
export function Kitchen() {
  const [key, setKey] = useState("");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [pushover, setPushover] = useState(true);
  const [needsKey, setNeedsKey] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [sound, setSound] = useState(true);
  const [loadedAt, setLoadedAt] = useState(0);
  const [unseen, setUnseen] = useState(0);
  const [view, setView] = useState<"zamowienia" | "menu" | "orari" | "klienci" | "opinie">("zamowienia");
  const [stage, setStage] = useState<StageId>("nowe");
  const [showClosed, setShowClosed] = useState(false);
  const known = useRef<Set<string> | null>(null);
  const soundRef = useRef(sound);
  const chime = useChime();
  const shop = useShopSettings(adminFetch);
  const play = chime.play;

  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  const load = useCallback(
    async (k: string) => {
      try {
        const res = await fetch("/api/orders", { headers: { "x-kitchen-key": k }, cache: "no-store" });
        if (res.status === 401) {
          setNeedsKey(true);
          setOrders(null);
          return;
        }
        const data = (await res.json()) as { orders: Order[]; pushover?: boolean };
        const seen = known.current;
        const fresh = seen ? data.orders.filter((o) => !seen.has(o.id)).length : 0;
        if (fresh) {
          if (soundRef.current) play();
          if (document.hidden) setUnseen((n) => n + fresh);
          setStage("nowe");
        }
        known.current = new Set(data.orders.map((o) => o.id));
        setNeedsKey(false);
        setOrders(data.orders);
        setPushover(Boolean(data.pushover));
        setLoadedAt(Date.now());
        setError("");
      } catch {
        setError("Connessione persa, riprovo…");
      }
    },
    [play],
  );

  useEffect(() => {
    const run = () => load(readKey());
    const first = setTimeout(run, 0);
    const id = setInterval(run, 5000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load]);

  // Licznik nowych zamówień w tytule karty, dopóki kuchnia nie wróci do panelu.
  useEffect(() => {
    const base = `Admin — ${RESTAURANT.name}`;
    document.title = unseen ? `(${unseen}) Nuovo ordine! — ${base}` : base;
    const onVisible = () => {
      if (!document.hidden) setUnseen(0);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [unseen]);

  const restore = async (o: Order) => {
    setBusy(o.id);
    setError("");
    const res = await adminFetch(`/api/orders/${o.id}`, { method: "PATCH", body: JSON.stringify({ action: "restore" }) });
    const data = (await res.json().catch(() => ({}))) as { order?: Order; error?: string };
    if (!res.ok) setError(data.error ?? "Qualcosa è andato storto.");
    await load(readKey());
    setBusy(null);
    // ripristinato: mostriamo la fase in cui è tornato
    const back = data.order;
    const stageOf = back ? STAGES.find((st) => st.statuses.includes(back.status)) : undefined;
    if (stageOf) {
      setShowClosed(false);
      setStage(stageOf.id);
    }
  };

  const advance = async (o: Order, to: OrderStatus, reason?: string) => {
    setBusy(o.id);
    setError("");
    const res = await adminFetch(`/api/orders/${o.id}`, { method: "PATCH", body: JSON.stringify({ status: to, reason: reason ?? null }) });
    if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Qualcosa è andato storto.");
    await load(readKey());
    setBusy(null);
    // zamówienie przeszło dalej — pokazujemy etap, w którym teraz jest
    const next = STAGES.find((s) => s.statuses.includes(to));
    if (next) setStage(next.id);
  };

  const list = orders ?? [];
  const today = loadedAt ? dayFmt.format(loadedAt) : "";
  const todays = list.filter((o) => dayFmt.format(new Date(o.createdAt)) === today && o.status !== "rifiutato");
  const inStage = (id: StageId) => list.filter((o) => STAGES.find((s) => s.id === id)!.statuses.includes(o.status)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const closed = list.filter((o) => CLOSED.includes(o.status)).slice(0, 30);

  return (
    <main className="min-h-[100svh] bg-[#f6f0e4] pb-24 text-ink">
      <header className="sticky top-0 z-30 border-b-2 border-ink bg-paper">
        <div className="container-page flex h-16 items-center gap-3">
          <Mark className="size-9 shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg leading-none font-extrabold">{RESTAURANT.name}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-ink/70">
              <span className={`size-2 rounded-full ${error ? "bg-pomodoro" : "bg-basilico"}`} />
              {error ? "offline" : loadedAt ? `aggiornato alle ${timeFmt.format(loadedAt)}` : "collegamento…"}
            </p>
          </div>
          <button
            type="button"
            aria-pressed={sound}
            aria-label={sound ? "Suono attivo" : "Suono spento"}
            onClick={() => {
              setSound((s) => !s);
              if (!sound) play();
            }}
            className={`flex size-11 items-center justify-center rounded-full border-2 border-ink ${sound ? "bg-ink text-paper" : "bg-paper"}`}
          >
            <BellIcon off={!sound} />
          </button>
          <Link href="/" className="hidden h-11 items-center rounded-full border-2 border-ink px-4 text-sm font-bold sm:flex">
            Sito
          </Link>
        </div>

        <nav aria-label="Sezioni" className="container-page flex gap-1 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(
            [
              ["zamowienia", "Ordini"],
              ["menu", "Menu"],
              ["orari", "Orari"],
              ["klienci", "Clienti"],
              ["opinie", "Recensioni"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-current={view === id ? "page" : undefined}
              onClick={() => setView(id)}
              className={`h-10 shrink-0 grow rounded-full px-3.5 text-sm font-bold transition-colors sm:text-base ${view === id ? "bg-ink text-paper" : "bg-[#f6f0e4] hover:bg-giallo/60"}`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <div className="container-page pt-5">
        {!needsKey ? (
          <div className="mb-5">
            <ShopStatusBar shop={shop} />
          </div>
        ) : null}
        {needsKey ? (
          <form
            className="mx-auto mt-10 grid max-w-sm gap-3 rounded-3xl border-2 border-ink bg-paper p-6"
            onSubmit={(e) => {
              e.preventDefault();
              try {
                sessionStorage.setItem(KEY_STORAGE, key);
              } catch {
                /* brak storage */
              }
              load(key);
            }}
          >
            <label className="grid gap-1.5 font-bold">
              Chiave admin
              <input value={key} onChange={(e) => setKey(e.target.value)} type="password" autoComplete="current-password" className="h-14 rounded-2xl border-2 border-ink px-4 text-lg" />
            </label>
            <button className="h-14 rounded-full bg-ink text-lg font-bold text-paper">Entra</button>
            <p className="text-sm text-ink/60">È la variabile KITCHEN_KEY del server.</p>
          </form>
        ) : view === "opinie" ? (
          <FeedbackPanel />
        ) : view === "orari" ? (
          <HoursPanel shop={shop} />
        ) : view === "menu" ? (
          <AdminMenu adminFetch={adminFetch} />
        ) : view === "klienci" ? (
          <CustomersPanel />
        ) : orders === null ? (
          <p className="py-20 text-center font-bold text-ink/60">Caricamento…</p>
        ) : (
          <>
            <dl className="grid grid-cols-3 overflow-hidden rounded-2xl border-2 border-ink bg-paper">
              <Stat label="Ordini oggi" value={String(todays.length)} />
              <Stat label="Incasso oggi" value={euro(todays.reduce((n, o) => n + o.total, 0))} />
              <Stat label="In attesa" value={String(inStage("nowe").length)} alert={inStage("nowe").length > 0} />
            </dl>

            {sound && !chime.ready ? (
              <button type="button" className="mt-3 w-full rounded-2xl bg-giallo px-4 py-3 text-left text-sm font-bold">
                Tocca qui per attivare il suono dei nuovi ordini
              </button>
            ) : null}
            {!pushover ? (
              <p className="mt-3 rounded-2xl border-2 border-dashed border-ink/25 px-4 py-2.5 text-sm font-semibold text-ink/70">
                Notifiche sul telefono spente: imposta PUSHOVER_TOKEN e PUSHOVER_USER sul server.
              </p>
            ) : null}
            {error ? <p className="mt-3 font-bold text-pomodoro">{error}</p> : null}

            {/* trzy etapy — na telefonie jako duże zakładki, na komputerze jako kolumny */}
            <div role="tablist" aria-label="Fasi" className="sticky top-[7rem] z-20 -mx-(--spacing-gutter) mt-5 grid grid-cols-3 gap-2 bg-[#f6f0e4] px-(--spacing-gutter) py-2 lg:hidden">
              {STAGES.map((s) => {
                const n = inStage(s.id).length;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={stage === s.id}
                    onClick={() => setStage(s.id)}
                    className={`relative flex h-16 flex-col items-center justify-center rounded-2xl border-2 border-ink leading-tight font-extrabold ${stage === s.id ? "bg-ink text-paper" : "bg-paper"}`}
                  >
                    <span className="text-xs font-bold opacity-70">Fase {s.step}</span>
                    <span className="text-[0.95rem]">{s.title}</span>
                    {n ? (
                      <span className={`tabular absolute -top-2 -right-1.5 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-ink px-1 text-xs text-ink ${s.tone}`}>{n}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <section className="mt-2 lg:hidden" aria-label={STAGES.find((s) => s.id === stage)!.title}>
              <p className="px-1 pb-2 text-sm font-semibold text-ink/60">{STAGES.find((s) => s.id === stage)!.hint}</p>
              <ul className="grid grid-cols-1 gap-4">
                <OrderList orders={inStage(stage)} now={loadedAt} busy={busy} onAdvance={advance} />
              </ul>
            </section>

            <div className="mt-6 hidden grid-cols-3 items-start gap-5 lg:grid">
              {STAGES.map((s) => (
                <section key={s.id} aria-labelledby={`etap-${s.id}`}>
                  <h2 id={`etap-${s.id}`} className="flex items-center gap-2 px-1">
                    <span className={`flex size-8 items-center justify-center rounded-full border-2 border-ink text-sm font-extrabold ${s.tone}`}>{s.step}</span>
                    <span className="text-xl font-extrabold">{s.title}</span>
                    <span className="tabular ml-auto text-sm font-bold text-ink/60">{inStage(s.id).length}</span>
                  </h2>
                  <p className="mt-1 px-1 text-sm font-semibold text-ink/60">{s.hint}</p>
                  <ul className="mt-3 grid grid-cols-1 gap-4">
                    <OrderList orders={inStage(s.id)} now={loadedAt} busy={busy} onAdvance={advance} />
                  </ul>
                </section>
              ))}
            </div>

            <section className="mt-10">
              <button
                type="button"
                aria-expanded={showClosed}
                onClick={() => setShowClosed((v) => !v)}
                className="flex h-12 w-full items-center justify-between rounded-2xl border-2 border-ink bg-paper px-4 font-bold"
              >
                Chiusi e annullati ({closed.length})
                <span aria-hidden>{showClosed ? "−" : "+"}</span>
              </button>
              {showClosed ? (
                <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {closed.map((o) => (
                    <li key={o.id} className="flex min-w-0 items-center gap-3 rounded-2xl border-2 border-ink/15 bg-paper px-4 py-3">
                      <span className={`size-2.5 shrink-0 rounded-full ${o.status === "rifiutato" ? "bg-pomodoro" : "bg-basilico"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">{o.customer.name}</p>
                        <p className="truncate text-xs font-semibold text-ink/60">
                          {dateFmt.format(new Date(o.createdAt))} {timeFmt.format(Date.parse(o.createdAt))} · {STATUS_LABEL[o.status]}
                          {o.rejectReason ? ` — ${o.rejectReason}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="tabular font-extrabold">{euro(o.total)}</span>
                        {o.status === "rifiutato" ? (
                          <button
                            type="button"
                            disabled={busy === o.id}
                            onClick={() => restore(o)}
                            className="rounded-full border-2 border-ink bg-giallo px-3 py-1 text-xs font-bold disabled:opacity-50"
                          >
                            Ripristina
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

type AdvanceFn = (o: Order, to: OrderStatus, reason?: string) => void;

function OrderList({ orders, now, busy, onAdvance }: { orders: Order[]; now: number; busy: string | null; onAdvance: AdvanceFn }) {
  if (!orders.length) return <li className="rounded-2xl border-2 border-dashed border-ink/20 p-8 text-center font-semibold text-ink/50">Niente qui</li>;
  return (
    <>
      {orders.map((o) => (
        <OrderCard key={o.id} order={o} now={now} busy={busy === o.id} onAdvance={onAdvance} />
      ))}
    </>
  );
}

function minutesAgo(now: number, iso: string) {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  return m < 1 ? "adesso" : m < 60 ? `${m} min fa` : m < 1440 ? `${Math.floor(m / 60)} h fa` : dateFmt.format(new Date(iso));
}

function navigationUrl(o: Order) {
  const destination = o.location ? `${o.location.lat},${o.location.lng}` : (o.address ?? "");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

const bigButton = "flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-ink text-lg font-extrabold shadow-[0_4px_0_var(--color-ink)] transition-[translate,box-shadow] active:translate-y-1 active:shadow-none disabled:opacity-50";

function OrderCard({ order: o, now, busy, onAdvance }: { order: Order; now: number; busy: boolean; onAdvance: AdvanceFn }) {
  const flow = ORDER_FLOW[o.mode] as readonly OrderStatus[];
  const next = flow[flow.indexOf(o.status) + 1];
  const fresh = o.status === "ricevuto" && now - Date.parse(o.createdAt) < 3 * 60_000;
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState(REJECT_REASONS[0]);
  const phone = o.customer.phone.replace(/\s/g, "");
  const canReject = o.status === "ricevuto" || o.status === "accettato";
  const delivery = o.mode === "domicilio";

  const startDelivery = () => {
    try {
      sessionStorage.setItem(SHARE_STORAGE + o.id, "1");
    } catch {
      /* brak storage */
    }
    onAdvance(o, "in_viaggio");
  };

  return (
    <li className={`overflow-hidden rounded-3xl border-2 border-ink bg-paper ${fresh ? "outline-4 outline-offset-2 outline-pomodoro" : ""}`}>
      <div className="flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink/60">
            {timeFmt.format(Date.parse(o.createdAt))} · {minutesAgo(now, o.createdAt)}
          </p>
          <p className="mt-0.5 truncate text-2xl leading-tight font-extrabold">{o.customer.name}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`rounded-full border-2 border-ink px-3 py-0.5 text-sm font-bold ${delivery ? "bg-cielo" : "bg-menta"}`}>{delivery ? "Consegna" : "Ritiro"}</span>
          <span className={`flex items-center gap-1.5 rounded-full px-3 py-0.5 text-sm font-bold ${o.paymentMethod === "card" ? "bg-ink text-paper" : "bg-giallo"}`}>
            {o.paymentMethod === "card" ? <CardIcon className="size-4" /> : <CashIcon className="size-4" />}
            {o.paymentMethod === "card" ? "Carta" : "Contanti"}
          </span>
        </div>
      </div>

      <ul className="mx-4 grid gap-0.5 border-y-2 border-dashed border-ink/20 py-3">
        {o.lines.map((l) => (
          <li key={l.id} className="flex gap-2 text-lg font-semibold">
            <span className="tabular w-8 shrink-0 font-extrabold">{l.qty}×</span>
            {l.name}
          </li>
        ))}
      </ul>
      {o.notes ? <p className="mx-4 mt-3 rounded-xl bg-giallo/60 px-3 py-2 font-semibold">Note: {o.notes}</p> : null}

      <div className="flex items-center gap-3 px-4 pt-3">
        <p className="tabular mr-auto text-2xl font-extrabold">{euro(o.total)}</p>
        <a href={`tel:${phone}`} className="flex h-11 items-center gap-2 rounded-full border-2 border-ink px-4 font-bold">
          <PhoneIcon />
          Chiama
        </a>
      </div>
      {o.address ? <p className="px-4 pt-2 font-semibold text-ink/70">{o.address}</p> : null}

      {o.status === "in_viaggio" && delivery ? <DeliveryPanel order={o} /> : null}

      <div className="p-4">
        {rejecting ? (
          <div className="rounded-2xl border-2 border-ink bg-rosa/60 p-3">
            <p className="font-bold">Motivo (lo vedrà il cliente)</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {REJECT_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={reason === r}
                  onClick={() => setReason(r)}
                  className={`rounded-full border-2 border-ink px-3 py-1.5 text-sm font-bold ${reason === r ? "bg-ink text-paper" : "bg-paper"}`}
                >
                  {r}
                </button>
              ))}
            </div>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={140} aria-label="Motivo" className="mt-2 h-12 w-full rounded-xl border-2 border-ink bg-paper px-3 font-semibold" />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setRejecting(false)} className="h-12 rounded-2xl border-2 border-ink bg-paper font-bold">
                Indietro
              </button>
              <button type="button" disabled={busy || !reason.trim()} onClick={() => onAdvance(o, "rifiutato", reason.trim())} className="h-12 rounded-2xl bg-ink font-bold text-paper disabled:opacity-50">
                Annulla ordine
              </button>
            </div>
          </div>
        ) : o.status === "ricevuto" ? (
          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <button type="button" disabled={busy} onClick={() => setRejecting(true)} className={`${bigButton} bg-paper`}>
              Rifiuta
            </button>
            <button type="button" disabled={busy} onClick={() => onAdvance(o, "accettato")} className={`${bigButton} bg-basilico`}>
              ✓ Accetta
            </button>
          </div>
        ) : o.status === "accettato" ? (
          <div className="grid gap-2">
            <button type="button" disabled={busy} onClick={delivery ? startDelivery : () => onAdvance(o, "pronto")} className={`${bigButton} bg-pomodoro`}>
              {delivery ? "Parto →" : "Pronto al banco"}
            </button>
            {canReject ? (
              <button type="button" disabled={busy} onClick={() => setRejecting(true)} className="h-10 text-sm font-bold text-ink/60 underline underline-offset-2">
                Annulla ordine
              </button>
            ) : null}
          </div>
        ) : next ? (
          <button type="button" disabled={busy} onClick={() => onAdvance(o, next)} className={`${bigButton} bg-basilico`}>
            ✓ {next === "consegnato" ? "Consegnato" : "Ritirato"}
          </button>
        ) : null}

        <div className="mt-3 flex items-center justify-between text-xs font-semibold text-ink/50">
          <Link href={`/ordine/${o.id}`} target="_blank" className="underline underline-offset-2">
            Pagina cliente
          </Link>
          <span>#{o.id.slice(0, 6).toUpperCase()}</span>
        </div>
      </div>
    </li>
  );
}

/**
 * Etap „W drodze”: mapa trasy, duży przycisk nawigacji i udostępnianie pozycji.
 * Pozycja idzie na serwer co ~8 s, dopóki kierowca jej nie wyłączy — klient widzi skuter na żywo.
 */
function DeliveryPanel({ order: o }: { order: Order }) {
  const storageKey = SHARE_STORAGE + o.id;
  const [sharing, setSharing] = useState(() => {
    try {
      return sessionStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState("");

  useEffect(() => {
    if (!sharing || !("geolocation" in navigator)) return;
    let lastSent = 0;
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMe(point);
        setGpsError("");
        if (Date.now() - lastSent < 8000) return;
        lastSent = Date.now();
        adminFetch(`/api/orders/${o.id}/rider`, { method: "POST", body: JSON.stringify(point) }).catch(() => undefined);
      },
      (err) => setGpsError(err.code === err.PERMISSION_DENIED ? "Posizione non autorizzata: il cliente vede una stima." : "Posizione non disponibile."),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [sharing, o.id]);

  const toggle = () => {
    const nextValue = !sharing;
    try {
      if (nextValue) sessionStorage.setItem(storageKey, "1");
      else sessionStorage.removeItem(storageKey);
    } catch {
      /* brak storage */
    }
    setSharing(nextValue);
  };

  return (
    <div className="mt-4 border-y-2 border-ink">
      <RouteMap home={o.location} delivery progress={0} status={o.status} rider={me ?? o.rider ?? null} homeLabel="Cliente" className="aspect-[4/3] sm:aspect-[16/10]" />
      <div className="grid gap-2 p-4 pb-0">
        <a href={navigationUrl(o)} target="_blank" rel="noreferrer" className={`${bigButton} bg-giallo`}>
          <NavIcon />
          Naviga dal cliente
        </a>
        <button type="button" onClick={toggle} className="flex min-h-11 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-bold">
          <span className={`size-2.5 rounded-full ${sharing && !gpsError ? "animate-pulse bg-basilico" : "bg-ink/30"}`} />
          {sharing ? "Il cliente vede dove sei · disattiva" : "Mostra al cliente dove sono"}
        </button>
        {gpsError ? <p className="text-center text-sm font-semibold text-pomodoro">{gpsError}</p> : null}
      </div>
    </div>
  );
}

/** Wszyscy klienci z historii zamówień, z wyszukiwarką. */
function CustomersPanel() {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    const load = () =>
      adminFetch("/api/customers")
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { customers: Customer[] } | null) => alive && d && setCustomers(d.customers))
        .catch(() => undefined);
    const first = setTimeout(load, 0);
    const id = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  if (!customers) return <p className="py-20 text-center font-bold text-ink/60">Caricamento…</p>;
  const q = query.trim().toLowerCase();
  const shown = q ? customers.filter((c) => [c.name, c.phone, c.email, c.lastAddress ?? ""].some((v) => v.toLowerCase().includes(q))) : customers;
  const spent = customers.reduce((n, c) => n + c.spent, 0);

  return (
    <>
      <dl className="grid grid-cols-3 overflow-hidden rounded-2xl border-2 border-ink bg-paper">
        <Stat label="Clienti" value={String(customers.length)} />
        <Stat label="Tornano" value={String(customers.filter((c) => c.orders > 1).length)} />
        <Stat label="Totale" value={euro(spent)} />
      </dl>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cerca: nome, telefono, email, indirizzo"
        aria-label="Cerca cliente"
        className="mt-4 h-14 w-full rounded-2xl border-2 border-ink bg-paper px-4 text-lg font-semibold placeholder:text-ink/40"
      />

      <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shown.length === 0 ? <li className="rounded-2xl border-2 border-dashed border-ink/20 p-8 text-center font-semibold text-ink/50">Nessun cliente trovato</li> : null}
        {shown.map((c) => (
          <li key={c.key} className="rounded-3xl border-2 border-ink bg-paper p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xl font-extrabold">{c.name}</p>
                <p className="truncate text-sm font-semibold text-ink/60">{c.email || "senza email"}</p>
              </div>
              {c.orders > 1 ? <span className="shrink-0 rounded-full bg-giallo px-3 py-0.5 text-sm font-bold">cliente abituale</span> : null}
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-[#f6f0e4] py-2">
                <dt className="text-xs font-semibold text-ink/60">Ordini</dt>
                <dd className="tabular text-lg font-extrabold">{c.orders}</dd>
              </div>
              <div className="rounded-xl bg-[#f6f0e4] py-2">
                <dt className="text-xs font-semibold text-ink/60">Speso</dt>
                <dd className="tabular text-lg font-extrabold">{euro(c.spent)}</dd>
              </div>
              <div className="rounded-xl bg-[#f6f0e4] py-2">
                <dt className="text-xs font-semibold text-ink/60">Ultimo</dt>
                <dd className="text-lg font-extrabold">{dateFmt.format(new Date(c.lastOrderAt))}</dd>
              </div>
            </dl>
            {c.lastAddress ? <p className="mt-3 truncate text-sm font-semibold text-ink/70">{c.lastAddress}</p> : null}
            {c.rejected ? <p className="mt-1 text-sm font-semibold text-pomodoro">Ordini annullati: {c.rejected}</p> : null}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-ink font-bold">
                <PhoneIcon />
                Chiama
              </a>
              {c.email ? (
                <a href={`mailto:${c.email}`} className="flex h-12 items-center justify-center rounded-2xl border-2 border-ink font-bold">
                  Email
                </a>
              ) : (
                <span />
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

type FeedbackData = {
  items: Feedback[];
  stats: { total: number; toGoogle: number; privateTotal: number; privateHandled: number; open: number; published: number; average: number };
  reactions: Record<string, number>;
};

/**
 * Opinie z formularza na stronie. 1–3★ czekają tu na reakcję lokalu
 * (telefon, rabat, przeprosiny) — „Załatwione” zamyka sprawę.
 */
function FeedbackPanel() {
  const [data, setData] = useState<FeedbackData | null>(null);
  const [filter, setFilter] = useState<"todo" | "all">("todo");

  const load = useCallback(async () => {
    const res = await adminFetch("/api/feedback").catch(() => null);
    if (res?.ok) setData((await res.json()) as FeedbackData);
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(load, 10_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load]);

  const act = async (id: string, action: FeedbackAction) => {
    await adminFetch(`/api/feedback/${id}`, { method: "PATCH", body: JSON.stringify({ action }) });
    load();
  };

  if (!data) return <p className="py-20 text-center font-bold text-ink/60">Caricamento…</p>;
  const { stats } = data;
  const list = filter === "todo" ? data.items.filter((i) => i.route === "privato" && i.status === "nuovo") : data.items;

  return (
    <>
      <dl className="grid grid-cols-3 overflow-hidden rounded-2xl border-2 border-ink bg-paper">
        <Stat label="Media" value={stats.total ? stats.average.toFixed(1).replace(".", ",") : "—"} />
        <Stat label="Recensioni" value={String(stats.total)} />
        <Stat label="Da gestire" value={String(stats.open)} alert={stats.open > 0} />
      </dl>
      <p className="mt-3 px-1 text-sm font-semibold text-ink/65">
        Le 4–5★ con testo pulito vanno subito sul sito, le 1–3★ arrivano prima qui. Reazioni rapide:{" "}
        {Object.entries(data.reactions)
          .map(([k, v]) => `${k} ${v}`)
          .join(", ")}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:flex">
        {(
          [
            ["todo", "Da gestire"],
            ["all", "Tutte"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
            className={`h-11 rounded-full border-2 border-ink px-5 font-bold ${filter === id ? "bg-ink text-paper" : "bg-paper"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.length === 0 ? <li className="rounded-2xl border-2 border-dashed border-ink/20 p-8 text-center font-semibold text-ink/50">Niente da gestire</li> : null}
        {list.map((f) => (
          <li key={f.id} className={`flex flex-col rounded-3xl border-2 border-ink p-4 ${f.rating <= 3 ? "bg-rosa" : "bg-paper"}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xl tracking-widest" aria-label={`${f.rating} stelle su 5`}>
                {"★".repeat(f.rating)}
                <span className="opacity-25">{"★".repeat(5 - f.rating)}</span>
              </p>
              <span className="text-sm font-semibold text-ink/60">
                {dateFmt.format(new Date(f.createdAt))} · {timeFmt.format(Date.parse(f.createdAt))}
              </span>
            </div>
            <p className="mt-1 text-lg font-extrabold">
              {f.name}
              {f.orderId ? <span className="ml-2 rounded-full bg-menta px-2 py-0.5 text-xs font-bold">ordine verificato</span> : null}
            </p>
            <p className="mt-1 flex-1 font-semibold">{f.text || <em className="text-ink/50">senza testo</em>}</p>
            {f.email ? (
              <a href={`mailto:${f.email}`} className="mt-1 truncate text-sm font-semibold text-ink/60 underline underline-offset-2">
                {f.email}
              </a>
            ) : null}
            {f.photos?.length ? (
              <div className="mt-3">
                <div className="flex gap-2">
                  {f.photos.map((name) => (
                    <a key={name} href={`/api/uploads/${name}`} target="_blank" rel="noreferrer" className="block size-20 overflow-hidden rounded-xl border-2 border-ink">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/uploads/${name}`} alt="Foto della recensione" className="size-full object-cover" />
                    </a>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => act(f.id, f.photosApproved ? "photosOff" : "photosOn")}
                  className={`mt-2 h-10 w-full rounded-2xl border-2 border-ink text-sm font-bold ${f.photosApproved ? "bg-paper" : "bg-giallo"}`}
                >
                  {f.photosApproved ? "Nascondi le foto dal sito" : "Approva le foto per il sito"}
                </button>
              </div>
            ) : null}
            <p className="mt-2 text-sm font-semibold text-ink/60">
              {f.status === "gestito" ? "gestita" : f.route === "privato" ? "da gestire" : "invitata su Google"} · {f.published ? "visibile sul sito" : "nascosta"}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 font-bold">
              {f.route === "privato" && f.status === "nuovo" ? (
                <button type="button" onClick={() => act(f.id, "handled")} className="h-12 rounded-2xl border-2 border-ink bg-basilico">
                  Segna gestita
                </button>
              ) : (
                <span />
              )}
              <button type="button" onClick={() => act(f.id, f.published ? "unpublish" : "publish")} className="h-12 rounded-2xl border-2 border-ink bg-paper">
                {f.published ? "Nascondi" : "Mostra sul sito"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function Stat({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className={`min-w-0 border-ink px-3 py-3 not-last:border-r-2 sm:px-4 ${alert ? "bg-pomodoro" : ""}`}>
      <dt className="truncate text-xs font-semibold text-ink/70">{label}</dt>
      <dd className="tabular truncate text-xl font-extrabold tracking-tight sm:text-2xl">{value}</dd>
    </div>
  );
}

function BellIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15Z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
      {off ? <path d="M4 4l16 16" /> : null}
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z" />
    </svg>
  );
}

function NavIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 11 21 3l-8 18-2-8-8-2Z" />
    </svg>
  );
}
