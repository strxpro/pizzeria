"use client";

import { animate, AnimatePresence, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useSpring } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { RESTAURANT } from "@/lib/data";
import { euro } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import { useOrder } from "@/lib/order";
import { useMedia } from "@/lib/use-media";
import { cheeseGo } from "./cheese";
import { Minus, Plus } from "./kit";
import { PaymentPicker } from "./payment-picker";

/** Luz wokół przycisku w gnieździe (po obu stronach razem). Pusty koszyk 64 px + 20 px = kółko 84 px. */
const DOCK_PAD = 20;

/**
 * Miejsce pod karuzelą menu, w które pływający koszyk „wpada” przy przewijaniu.
 * Na komputerze gniazdo ma kształt przycisku: pusty koszyk — kółko, a gdy pojawia się
 * kwota, gniazdo sprężyście poszerza się razem z nim. Na telefonie gniazda nie ma: tam pasek
 * zostaje przy dolnej krawędzi — przestawianie go z JavaScriptu przy rzadkich zdarzeniach
 * przewijania w telefonie wyglądało jak teleportowanie.
 */
export function CartDockSlot() {
  const wide = useMedia("(min-width: 1024px)");
  const width = useMotionValue(64 + DOCK_PAD);
  const smooth = useSpring(width, { stiffness: 420, damping: 34 });

  // Przycisk koszyka znika, gdy otwarta jest szuflada zamówienia — po jej zamknięciu podpinamy się od nowa.
  const { isOpen } = useOrder();

  useEffect(() => {
    if (!wide || isOpen) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const el = e.target as HTMLElement;
        if (el.offsetWidth) width.set(el.offsetWidth + DOCK_PAD);
      }
    });
    const id = setTimeout(() => document.querySelectorAll("button[data-dock-target]").forEach((el) => ro.observe(el)));
    return () => {
      clearTimeout(id);
      ro.disconnect();
    };
  }, [wide, isOpen, width]);

  return (
    <div aria-hidden className="relative mx-auto hidden h-28 items-center justify-center px-3 lg:flex">
      {/* pełne „łóżko” na koszyk z wcięciem w środek — bez przezroczystych przerw */}
      <motion.span
        data-cart-dock
        style={wide ? { width: smooth } : undefined}
        className="block h-[5.25rem] w-full rounded-full bg-ink/[0.07] shadow-[inset_0_5px_0_rgb(18_12_8/0.08)]"
      />
    </div>
  );
}

/**
 * Przyklejanie do gniazda: koszyk pływa przy dolnej krawędzi ekranu, a gdy
 * gniazdo pod karuzelą do niego dojedzie, łapie go i niesie ze stroną.
 * Po przewinięciu kawałek dalej koszyk się odkleja i sprężyście wraca na dół.
 */
export function useCartDock() {
  const el = useRef<HTMLDivElement>(null);
  const y = useMotionValue(0);
  const [docked, setDocked] = useState(false);
  const state = useRef<{ docked: boolean; last: number | null }>({ docked: false, last: null });
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();

  // Pozycje mierzymy tylko przy zmianie rozmiaru strony; przy przewijaniu liczymy z scrollY.
  // (Dwa odczyty układu na każdą klatkę przewijania dawały mikro-przycięcia.)
  const geo = useRef<{ slotCenter: number; floatCenter: number } | null>(null);
  const measure = useCallback(() => {
    const slot = document.querySelector<HTMLElement>("[data-cart-dock]");
    const node = el.current;
    const target = node?.querySelector<HTMLElement>("[data-dock-target]");
    if (!slot || !node || !target || !node.offsetHeight) {
      geo.current = null;
      return;
    }
    const s = slot.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    geo.current = {
      slotCenter: s.top + s.height / 2 + window.scrollY,
      floatCenter: t.top + t.height / 2 - y.get(),
    };
  }, [y]);

  const update = useCallback(() => {
    if (!geo.current) measure();
    const g = geo.current;
    if (!g) return;
    const delta = g.slotCenter - window.scrollY - g.floatCenter; // < 0: gniazdo jest już nad miejscem pływania
    // Trzyma długo: odkleja się dopiero po ~połowie ekranu przewijania.
    const detachAt = -Math.min(480, window.innerHeight * 0.5);
    const inRange = delta <= 0 && delta > detachAt;
    const st = state.current;
    const last = st.last;
    st.last = delta;

    // Przykleja się tylko wtedy, gdy gniazdo przejedzie przez koszyk w trakcie przewijania
    // (poprzednio było jeszcze poniżej). Wejście w zakres z innej strony — np. przewijanie
    // w górę albo odświeżenie strony w połowie menu — nie ściąga koszyka skokiem.
    if (!st.docked && inRange && last !== null && last > 0) {
      st.docked = true;
      setDocked(true);
    }

    if (st.docked && inRange) {
      y.stop();
      // pełne piksele: ułamkowe przesunięcie rozmywa tekst koszyka i paragonu
      y.set(Math.round(delta));
    } else if (st.docked) {
      st.docked = false;
      setDocked(false);
      // Odklejenie: sprężysty powrót z lekkim przestrzeleniem.
      animate(y, 0, reduced ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 16 });
    }
  }, [reduced, y, measure]);

  useMotionValueEvent(scrollY, "change", update);
  useEffect(() => {
    const first = requestAnimationFrame(() => {
      measure();
      update();
    });
    // zmiana wysokości czegokolwiek nad gniazdem (np. inna kategoria menu) przesuwa gniazdo
    const ro = new ResizeObserver(() => {
      measure();
      update();
    });
    ro.observe(document.body);
    // pasek adresu w telefonie zmienia wysokość okna, a z nią położenie pływającego koszyka
    const onResize = () => {
      measure();
      update();
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(first);
      ro.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [update, measure]);

  return { el, y, docked };
}


/**
 * Koszyk w formie paragonu. Przycisk z ikoną koszyka; najechanie myszą albo
 * kliknięcie wysuwa nad nim „wydruk” z pozycjami, sumą i przejściem do zamówienia.
 * Ten sam paragon otwiera się z dolnego paska na telefonie.
 */
export function useReceipt() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const hoverProps = {
    onPointerEnter: (e: ReactPointerEvent) => {
      if (e.pointerType !== "mouse") return;
      if (closeTimer.current) clearTimeout(closeTimer.current);
      setOpen(true);
    },
    onPointerLeave: (e: ReactPointerEvent) => {
      if (e.pointerType !== "mouse") return;
      closeTimer.current = setTimeout(() => setOpen(false), 220);
    },
  };

  return { open, setOpen, root, hoverProps };
}

/** Komputer: okrągły przycisk koszyka na dole, na środku. */
export function CartButton() {
  const t = useT();
  const order = useOrder();
  const { open, setOpen, root, hoverProps } = useReceipt();
  const panelId = useId();
  const { el, y, docked } = useCartDock();

  if (order.isOpen) return null;

  return (
    <div ref={root} {...hoverProps} className="fixed inset-x-0 bottom-6 z-40 mx-auto hidden w-fit lg:block">
      <motion.div ref={el} style={{ y }} className="relative pb-2">
        <ReceiptPopover open={open} id={panelId} onCheckout={() => setOpen(false)} className="bottom-full left-1/2 -ml-[11rem] mb-3 w-[22rem]" />
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={order.count ? t.order.cartWith(euro(order.total)) : t.order.cart}
          data-dock-target
          onClick={() => setOpen((o) => !o)}
          className={`btn-raised flex h-16 min-w-16 items-center justify-center rounded-full p-2 text-paper transition-colors ${docked ? "bg-notte" : "bg-ink"}`}
        >
        <CartBadge count={order.count} />
        {/* kwota pojawia się dopiero, gdy w koszyku coś jest */}
        <AnimatePresence initial={false}>
          {order.count ? (
            <motion.span
              key="total"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "auto", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 34 }}
              className="tabular overflow-hidden text-lg font-extrabold whitespace-nowrap"
            >
              <span className="block pr-4 pl-3">{euro(order.total)}</span>
            </motion.span>
          ) : null}
        </AnimatePresence>
        </button>
      </motion.div>
    </div>
  );
}

/** Ikona koszyka z licznikiem, który podskakuje przy każdej zmianie. */
export function CartBadge({ count, dark = false }: { count: number; dark?: boolean }) {
  const t = useT();
  const reduced = useReducedMotion();
  return (
    // Kółko pod ikoną pojawia się dopiero, gdy w koszyku coś jest — pusty koszyk to sama ikona.
    <span
      className={`relative flex size-11 items-center justify-center rounded-full transition-[background-color,color,scale] duration-300 ease-(--ease-out) ${
        count > 0 ? (dark ? "scale-100 bg-ink text-paper" : "scale-100 bg-giallo text-ink") : "scale-95 bg-transparent text-current"
      }`}
    >
      <CartIcon />
      <AnimatePresence mode="popLayout" initial={false}>
        {count > 0 ? (
          <motion.span
            key={count}
            initial={reduced ? false : { scale: 0.2, y: 6 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.2, opacity: 0 }}
            transition={{ type: "spring", stiffness: 600, damping: 18 }}
            className="tabular absolute -top-1.5 -right-1.5 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-ink bg-pomodoro px-1 text-xs font-extrabold text-ink"
          >
            <span className="sr-only">{t.order.articles}: </span>
            {count}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}

export function CartIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.5 3.5h2.6l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 1.9-1.5l1.6-6.3H6.3" />
      <circle cx="9.5" cy="20" r="1.4" fill="currentColor" />
      <circle cx="17" cy="20" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function ReceiptPopover({ open, id, className, onCheckout }: { open: boolean; id: string; className: string; onCheckout: () => void }) {
  const t = useT();
  const reduced = useReducedMotion();
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          id={id}
          role="dialog"
          aria-label={t.order.receipt}
          className={`absolute origin-bottom ${className}`}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scaleY: 0.6 }}
          animate={{ opacity: 1, y: 0, scaleY: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scaleY: 0.8, transition: { duration: 0.15 } }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
        >
          <Receipt onCheckout={onCheckout} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function Receipt({ onCheckout }: { onCheckout: () => void }) {
  const t = useT();
  const order = useOrder();
  const [stamp] = useState(() =>
    new Intl.DateTimeFormat(t.lang.locale, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date()),
  );

  return (
    <div className="relative -rotate-1">
      {/* „cień” paragonu: ta sama ząbkowana kartka, przesunięta — bez rozmycia */}
      <div aria-hidden className="receipt-edge absolute inset-0 translate-x-1.5 translate-y-2 bg-ink" />
      <div className="receipt-edge relative bg-paper px-6 pt-7 pb-8 font-mono text-[0.9rem] text-ink">
        <div className="text-center">
          <p className="font-sans text-xl font-extrabold tracking-tight">{RESTAURANT.name}</p>
          <p className="text-xs uppercase">{RESTAURANT.street} · Genova</p>
          <p className="mt-1 text-xs">{stamp}</p>
        </div>

        <Rule />

        {order.count === 0 ? (
          <div className="py-4 text-center">
            <p className="font-bold">{t.order.receiptEmpty}</p>
            <p className="font-hand mt-1 text-xl">{t.order.receiptEmptyNote}</p>
          </div>
        ) : (
          <ul className="scroll-pizza -mr-3 grid max-h-[min(15rem,35vh)] gap-2 overflow-y-auto pr-3" data-lenis-prevent>
            {order.lines.map(({ item, qty }) => (
              <li key={item.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold uppercase">{item.name}</span>
                  <span className="text-xs">
                    {qty} × {euro(item.price)}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <MiniButton label={t.menu.removeOne(item.name)} onClick={() => order.remove(item.id)}>
                    <Minus />
                  </MiniButton>
                  <MiniButton label={t.menu.addOne(item.name)} onClick={() => order.add(item.id)}>
                    <Plus />
                  </MiniButton>
                </span>
                <span className="tabular w-[4.5rem] text-right font-bold">{euro(qty * item.price)}</span>
              </li>
            ))}
          </ul>
        )}

        <Rule />

        <div className="grid grid-cols-2 gap-2 font-sans">
          {(["domicilio", "ritiro"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={order.mode === m}
              onClick={() => order.setMode(m)}
              className={`btn-3d btn-3d-sm h-9 rounded-full text-sm font-bold ${order.mode === m ? "bg-ink text-paper" : "bg-paper"}`}
            >
              {m === "domicilio" ? t.order.homeDelivery : t.order.pickup}
            </button>
          ))}
        </div>

        <dl className="tabular mt-4 grid gap-1">
          <Row label={t.order.receiptSubtotal} value={euro(order.subtotal)} />
          {order.zone ? <Row label={t.order.receiptDelivery} value={order.deliveryFee ? euro(order.deliveryFee) : t.common.free.toUpperCase()} /> : null}
          <div className="mt-2 flex items-baseline justify-between border-t-2 border-dashed border-ink pt-2 text-lg font-extrabold">
            <dt>{t.order.receiptTotal}</dt>
            <dd>{euro(order.total)}</dd>
          </div>
        </dl>
        <div className="mt-4 border-t-2 border-dashed border-ink pt-3">
          <PaymentPicker size="sm" />
        </div>
        <p className="mt-1 text-center text-xs">{t.order.receiptPay}</p>

        {/* kod kreskowy */}
        <div aria-hidden className="mx-auto mt-4 h-10 w-3/4 bg-[repeating-linear-gradient(90deg,#120c08_0_2px,transparent_2px_4px,#120c08_4px_7px,transparent_7px_9px,#120c08_9px_10px,transparent_10px_13px)]" />

        <button
          type="button"
          onClick={() => {
            onCheckout();
            if (order.count) order.setOpen(true);
            else cheeseGo("#menu", t.nav.menu);
          }}
          className="btn-3d mt-5 flex h-12 w-full items-center justify-center rounded-full bg-pomodoro font-sans text-base font-extrabold"
        >
          {order.count ? t.order.orderNow : t.order.seeMenu}
        </button>
      </div>
    </div>
  );
}

function Rule() {
  return <div aria-hidden className="my-3 border-t-2 border-dashed border-ink" />;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function MiniButton({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="btn-3d btn-3d-sm flex size-7 items-center justify-center rounded-full bg-giallo [&_svg]:size-3.5">
      {children}
    </button>
  );
}
