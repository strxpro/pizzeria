"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FINAL_STATUSES, ORDER_FLOW, RESTAURANT, type OrderStatus } from "@/lib/data";
import { euro } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import type { PublicOrder } from "@/lib/order-types";
import { HandNote } from "./kit";
import { LangSwitch } from "./lang-switch";
import { Liquid } from "./liquid";
import { ART, PizzaArt } from "./pizza-art";
import { Mark } from "./preloader";
import { RouteMap } from "./route-map";
import { ReceiptIcon } from "./site-header";

const POLL_MS = 4000;
const noop = () => () => {};

/**
 * Śledzenie zamówienia na żywo. Strona odpytuje serwer co kilka sekund;
 * przy zmianie etapu pokazuje dymek i — jeśli klient pozwolił — powiadomienie
 * systemowe. E-mail o tych samych etapach wysyła serwer.
 *
 * Pozycja skutera na mapie jest SZACOWANA z czasu wyjazdu i czasu jazdy strefy
 * (bez GPS kuriera) — i tak jest opisana na stronie.
 */
export function Tracking({ initial }: { initial: PublicOrder }) {
  const t = useT();
  const reduced = useReducedMotion();
  const [order, setOrder] = useState(initial);
  const [toast, setToast] = useState<OrderStatus | null>(null);
  const [now, setNow] = useState(() => Date.parse(initial.createdAt));
  const [, setPermTick] = useState(0);
  const last = useRef(initial.status);
  const timeFmt = useMemo(() => new Intl.DateTimeFormat(t.lang.locale, { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }), [t.lang.locale]);

  const rejected = order.status === "rifiutato";
  const flow = ORDER_FLOW[order.mode] as readonly OrderStatus[];
  // Przy odrzuceniu pokazujemy etapy do ostatniego osiągniętego.
  const reached = rejected ? Math.max(0, ...order.history.map((h) => flow.indexOf(h.status))) : flow.indexOf(order.status);
  const done = FINAL_STATUSES.includes(order.status);

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    if (done) return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/orders/${order.id}`, { cache: "no-store" });
        if (!res.ok || stop) return;
        const { order: fresh } = (await res.json()) as { order: PublicOrder };
        setOrder(fresh);
        if (fresh.status !== last.current) {
          last.current = fresh.status;
          setToast(fresh.status);
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(t.status[fresh.status].title, { body: t.status[fresh.status].text, tag: fresh.id });
          }
        }
      } catch {
        /* chwilowy brak sieci — spróbujemy przy następnym tyknięciu */
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [order.id, done, t]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const permission = useSyncExternalStore(
    noop,
    () => ("Notification" in window ? Notification.permission : "unsupported"),
    () => "unsupported",
  );

  const at = (s: OrderStatus) => order.history.find((h) => h.status === s)?.at;
  const dispatchedAt = at(order.mode === "domicilio" ? "in_viaggio" : "pronto");
  const etaMs = dispatchedAt
    ? Date.parse(dispatchedAt) + order.travelMinutes * 60_000
    : Math.max(now, Date.parse(order.createdAt)) + (RESTAURANT.prepMinutes + order.travelMinutes + (order.mode === "ritiro" ? 5 : 0)) * 60_000;

  const riderProgress =
    order.mode === "ritiro" || rejected ? 0 : done ? 1 : dispatchedAt ? Math.min(0.94, Math.max(0.04, (now - Date.parse(dispatchedAt)) / (order.travelMinutes * 60_000))) : 0;

  // GPS kierowcy liczy się tylko, gdy jest świeży — inaczej wracamy do szacunku.
  const liveRider = order.status === "in_viaggio" && order.rider && now - Date.parse(order.rider.at) < 120_000 ? order.rider : null;

  const copy = t.status[order.status];

  return (
    <main className={`relative isolate min-h-[100svh] overflow-hidden pb-16 ${rejected ? "bg-rosa" : "bg-giallo"}`}>
      <Liquid
        layers={
          rejected
            ? [{ color: "#ffe6f0", x: -25, y: 10, size: 80, seed: 61, duration: 20 }]
            : [
                { color: "#ffe38a", x: -25, y: 10, size: 80, seed: 61, duration: 20 },
                { color: "#ffb326", x: 55, y: 45, size: 70, seed: 62, duration: 24, opacity: 0.8 },
              ]
        }
      />

      <header className="container-page flex h-20 items-center justify-between gap-2">
        <Link href="/" className="btn-3d btn-3d-sm flex h-11 items-center gap-2 rounded-full bg-paper pr-4 pl-1 font-extrabold">
          <Mark className="size-8" />
          <span className="max-sm:hidden">{RESTAURANT.name}</span>
        </Link>
        <div className="flex items-center gap-2">
          <LangSwitch />
          <Link href="/i-miei-ordini" className="btn-3d btn-3d-sm flex h-11 items-center gap-2 rounded-full bg-paper px-3 text-sm font-bold" aria-label={t.tracking.allOrders}>
            <ReceiptIcon />
            <span className="max-md:hidden">{t.tracking.allOrders}</span>
          </Link>
          <a href={RESTAURANT.phoneHref} className="btn-3d btn-3d-sm flex h-11 items-center rounded-full bg-ink px-5 text-sm font-bold text-paper">
            {t.common.call}
          </a>
        </div>
      </header>

      <div className="container-page grid gap-10 pt-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:pt-12">
        <div>
          <p className="font-hand text-2xl -rotate-2">{t.tracking.order(order.id.slice(0, 6).toUpperCase())}</p>
          <AnimatePresence mode="wait">
            <motion.h1
              key={order.status}
              initial={reduced ? false : { y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduced ? undefined : { y: -20, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="mt-2 text-[clamp(2.6rem,7vw,6rem)] leading-[0.88] font-extrabold tracking-tight"
              aria-live="polite"
            >
              {copy.title}
            </motion.h1>
          </AnimatePresence>
          <p className="mt-4 text-xl font-semibold">{copy.text}</p>
          {rejected && order.rejectReason ? <p className="mt-2 text-lg font-bold">{t.tracking.reason(order.rejectReason)}</p> : null}

          {!done ? (
            <p className="mt-6 inline-flex flex-wrap items-baseline gap-x-3 rounded-[1.5rem] border-[2.5px] border-ink bg-paper px-5 py-3">
              <span className="font-bold">{order.mode === "domicilio" ? t.tracking.arrivesAt : t.tracking.readyAt}</span>
              <span className="tabular text-4xl font-extrabold tracking-tight">{timeFmt.format(etaMs)}</span>
            </p>
          ) : null}
          {order.placedWhileClosed && order.status === "ricevuto" ? <p className="mt-3 font-bold">{t.tracking.placedClosed}</p> : null}

          <ol className="mt-10 grid gap-2">
            {flow.map((s, i) => {
              const state = rejected ? (i <= reached ? "done" : "cut") : i < reached ? "done" : i === reached ? "now" : "next";
              const when = at(s);
              return (
                <li
                  key={s}
                  className={`flex items-center gap-4 rounded-full border-[2.5px] border-ink px-3 py-2 transition-colors duration-500 ${
                    state === "now" ? "bg-ink text-paper" : state === "done" ? "bg-paper" : state === "cut" ? "bg-transparent line-through opacity-40" : "bg-transparent opacity-55"
                  }`}
                  aria-current={state === "now" ? "step" : undefined}
                >
                  <span className={`relative flex size-9 shrink-0 items-center justify-center rounded-full font-extrabold ${state === "now" ? "bg-pomodoro text-ink" : state === "done" ? "bg-basilico" : "bg-paper/60"}`}>
                    {state === "now" && !done ? <span className="absolute inset-0 animate-ping rounded-full bg-pomodoro/60" /> : null}
                    <span className="relative">{state === "done" ? "✓" : state === "cut" ? "✕" : i + 1}</span>
                  </span>
                  <span className="flex-1 text-lg font-extrabold">{t.status[s].short}</span>
                  {when ? <span className="tabular pr-2 text-sm font-bold opacity-80">{timeFmt.format(Date.parse(when))}</span> : null}
                </li>
              );
            })}
          </ol>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <p className="font-semibold">{t.tracking.emailed(order.customer.email)}</p>
            {!done && permission === "default" ? (
              <button
                type="button"
                onClick={async () => {
                  await Notification.requestPermission();
                  setPermTick((n) => n + 1);
                }}
                className="btn-3d btn-3d-sm h-10 rounded-full bg-paper px-4 text-sm font-bold"
              >
                {t.tracking.notify}
              </button>
            ) : !done && permission === "granted" ? (
              <span className="font-hand text-xl">{t.tracking.notifyOn}</span>
            ) : null}
          </div>
        </div>

        <div className="lg:pt-10">
          <div className="overflow-hidden rounded-[2rem] border-[2.5px] border-ink bg-paper shadow-[0_8px_0_var(--color-ink)]">
            <RouteMap home={order.location} delivery={order.mode === "domicilio"} progress={riderProgress} status={order.status} rider={liveRider} />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t-[2.5px] border-ink px-5 py-3 text-sm font-bold">
              <span>{order.mode === "domicilio" ? t.tracking.to(order.address ?? "") : t.tracking.pickupAt(RESTAURANT.street)}</span>
              <span className="opacity-70">{order.mode !== "domicilio" ? t.tracking.waiting : liveRider ? t.tracking.live : t.tracking.estimated}</span>
            </div>
          </div>

          <div className="mt-6 rounded-[2rem] border-[2.5px] border-ink bg-paper p-5 shadow-[0_8px_0_var(--color-ink)]">
            <ul>
              {order.lines.map((l) => (
                <li key={l.id} className="tabular flex justify-between gap-3 py-1 font-semibold">
                  <span>
                    {l.qty} × {l.name}
                  </span>
                  <span>{euro(l.qty * l.price)}</span>
                </li>
              ))}
              {order.deliveryFee ? (
                <li className="tabular flex justify-between gap-3 py-1 font-semibold">
                  <span>{t.tracking.delivery(order.zoneName ?? "")}</span>
                  <span>{euro(order.deliveryFee)}</span>
                </li>
              ) : null}
            </ul>
            <p className={`tabular mt-2 flex justify-between border-t-[2.5px] border-ink pt-3 text-2xl font-extrabold ${rejected ? "line-through opacity-50" : ""}`}>
              <span>{t.tracking.toPay}</span>
              <span>{euro(order.total)}</span>
            </p>
            {!rejected ? (
              <HandNote rotate={-3} className="mt-2 text-xl">
                {order.paymentMethod === "cash" ? `${t.order.payCash} · ${t.order.payCashSub}` : `${t.order.payCard} · ${t.order.payCardSub}`}
              </HandNote>
            ) : null}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {toast ? (
          <motion.div
            role="status"
            className={`fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-[1.5rem] border-[2.5px] border-ink p-3 pr-5 shadow-[0_6px_0_var(--color-ink)] ${toast === "rifiutato" ? "bg-rosa" : "bg-pomodoro"}`}
            initial={{ y: 140 }}
            animate={{ y: 0 }}
            exit={{ y: 140 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
          >
            <PizzaArt {...ART.diavola} className="size-12 shrink-0 animate-spin-slow" />
            <div>
              <p className="font-extrabold">{t.status[toast].title}</p>
              <p className="text-sm font-semibold">{t.status[toast].text}</p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
