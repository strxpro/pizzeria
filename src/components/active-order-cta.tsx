"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FINAL_STATUSES, type OrderStatus } from "@/lib/data";
import { useT } from "@/lib/i18n/provider";
import { useOrder } from "@/lib/order";
import type { PublicOrder } from "@/lib/order-types";
import { ReceiptIcon } from "./site-header";

const POLL_MS = 10_000;
/** Jak długo po zakończeniu zamówienia przycisk jeszcze wisi (żeby klient zobaczył „dostarczone”). */
const KEEP_AFTER_DONE_MS = 15 * 60_000;

const DOT: Record<OrderStatus, string> = {
  ricevuto: "bg-giallo",
  accettato: "bg-basilico",
  in_viaggio: "bg-cielo",
  pronto: "bg-cielo",
  consegnato: "bg-basilico",
  ritirato: "bg-basilico",
  rifiutato: "bg-pomodoro",
};

/**
 * Pływający przycisk „Moje zamówienie”, gdy klient ma zamówienie w toku.
 * Chwilę po wejściu na stronę — i przy każdej zmianie etapu — wyskakuje z niego dymek
 * ze stanem (przyjęte, odrzucone, w drodze…). Kliknięcie prowadzi do śledzenia.
 * Nie pokazuje się w panelu admina ani na samej stronie śledzenia.
 */
export function ActiveOrderCTA() {
  const t = useT();
  const reduced = useReducedMotion();
  const pathname = usePathname();
  const { activeOrderId, setActiveOrderId } = useOrder();
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [bubble, setBubble] = useState(false);
  const [hover, setHover] = useState(false);
  const lastStatus = useRef<OrderStatus | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hidden = !activeOrderId || pathname.startsWith("/admin") || pathname.startsWith("/cucina") || pathname.startsWith("/ordine/");

  useEffect(() => {
    if (!activeOrderId) return;
    let alive = true;

    const pop = (ms: number) => {
      setBubble(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => alive && setBubble(false), ms);
    };

    const load = async () => {
      try {
        const res = await fetch(`/api/orders/${activeOrderId}`, { cache: "no-store" });
        if (!alive) return;
        if (res.status === 404) return setActiveOrderId(null);
        if (!res.ok) return;
        const { order: fresh } = (await res.json()) as { order: PublicOrder };
        if (!alive) return;

        const finishedAt = fresh.history.at(-1)?.at;
        if (FINAL_STATUSES.includes(fresh.status) && finishedAt && Date.now() - Date.parse(finishedAt) > KEEP_AFTER_DONE_MS) {
          setActiveOrderId(null);
          return;
        }
        setOrder(fresh);
        if (lastStatus.current !== fresh.status) {
          // pierwsze wczytanie: dymek po chwili; zmiana etapu: od razu i dłużej
          const first = lastStatus.current === null;
          lastStatus.current = fresh.status;
          if (first) setTimeout(() => alive && pop(5000), 1200);
          else pop(7000);
        }
      } catch {
        /* chwilowy brak sieci — spróbujemy przy następnym odpytaniu */
      }
    };

    const first = setTimeout(load, 0);
    const id = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(id);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [activeOrderId, setActiveOrderId]);

  if (hidden || !order || order.id !== activeOrderId) return null;
  const copy = t.status[order.status];
  const open = bubble || hover;

  return (
    <div
      className="fixed right-3 bottom-[6.25rem] z-40 lg:right-6 lg:bottom-6"
      onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      <AnimatePresence>
        {open ? (
          <motion.div
            key={order.status}
            role="status"
            aria-live="polite"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.9, transition: { duration: 0.15 } }}
            transition={{ type: "spring", stiffness: 420, damping: 26 }}
            className="absolute right-0 bottom-full mb-3 w-[min(17rem,calc(100vw-1.5rem))] origin-bottom-right"
          >
            <Link href={`/ordine/${order.id}`} className={`block rounded-[1.4rem] rounded-br-md border-[2.5px] border-ink p-3.5 pr-4 shadow-[0_5px_0_var(--color-ink)] ${order.status === "rifiutato" ? "bg-rosa" : "bg-paper"}`}>
              <p className="flex items-center gap-2 text-base leading-tight font-extrabold">
                <span className={`size-2.5 shrink-0 rounded-full border-2 border-ink ${DOT[order.status]}`} />
                {copy.title}
              </p>
              <p className="mt-1 text-sm leading-snug font-semibold opacity-80">{order.rejectReason && order.status === "rifiutato" ? t.tracking.reason(order.rejectReason) : copy.text}</p>
            </Link>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.div initial={reduced ? false : { opacity: 0, y: 24, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}>
        <Link
          href={`/ordine/${order.id}`}
          aria-label={`${t.nav.myOrder}: ${copy.short}`}
          className="btn-3d flex h-14 items-center gap-2.5 rounded-full bg-ink pr-5 pl-2 font-extrabold text-paper"
        >
          <span className="relative flex size-10 items-center justify-center rounded-full bg-giallo text-ink">
            <ReceiptIcon />
            {!FINAL_STATUSES.includes(order.status) ? <span className={`absolute -top-0.5 -right-0.5 size-3 animate-pulse rounded-full border-2 border-ink ${DOT[order.status]}`} /> : null}
          </span>
          <span className="leading-tight">
            <span className="block text-[0.95rem]">{t.nav.myOrder}</span>
            <span className="block text-xs font-bold opacity-75">{copy.short}</span>
          </span>
        </Link>
      </motion.div>
    </div>
  );
}
