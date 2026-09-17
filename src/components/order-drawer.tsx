"use client";

import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { RESTAURANT, ZONES } from "@/lib/data";
import { euro, isPaused } from "@/lib/format";
import { useShop } from "@/lib/shop";
import { useT } from "@/lib/i18n/provider";
import { useOrder, type Mode } from "@/lib/order";
import { CartBadge, CartButton, ReceiptPopover, useCartDock, useReceipt } from "./cart-receipt";
import { cheeseGo } from "./cheese";
import { PhoneIcon } from "./hero";
import { HandNote } from "./kit";
import { LocateButton } from "./locate-button";
import { Minus, Plus } from "./kit";
import { OpenStatus } from "./open-status";
import { ART, PizzaArt } from "./pizza-art";
import { EmailVerify } from "./email-verify";
import { PaymentPicker } from "./payment-picker";
import { lockScroll } from "./smooth-scroll";

/**
 * Zamawianie: dolny pasek z przyciskami (telefon), pływający pasek koszyka
 * (komputer) i szuflada z formularzem. Zamówienie trafia na serwer,
 * a klient ląduje na stronie śledzenia.
 */
export function OrderDrawer() {
  const t = useT();
  const order = useOrder();
  const router = useRouter();
  const reduced = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);

  const { isOpen, setOpen } = order;

  // Zdejmujemy blokadę także przy odmontowaniu (np. przejście na stronę śledzenia).
  useEffect(() => () => lockScroll(false, "drawer"), []);

  useEffect(() => {
    lockScroll(isOpen, "drawer");
    if (!isOpen) {
      opener.current?.focus?.();
      return;
    }
    opener.current = document.activeElement as HTMLElement | null;
    panel.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "Tab" && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input, textarea, select");
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, setOpen]);

  const outOfRange = order.located !== null && order.located.zoneId === null;
  const shop = useShop();
  const blockedReason = isPaused(shop)
    ? t.errors.paused
    : order.count === 0
      ? t.order.emptyOrder
      : order.missingForMinimum > 0
        ? t.order.minimum(order.zone?.name ?? "", euro(order.zone?.minimum ?? 0), euro(order.missingForMinimum))
        : order.mode === "domicilio" && outOfRange
          ? t.order.outOfZone
          : !verifiedEmail
            ? t.order.verifyFirst
            : null;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (blockedReason || busy) return;
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const placed = await order.submit({
        name: String(data.get("name") ?? ""),
        phone: String(data.get("phone") ?? ""),
        email: String(data.get("email") ?? ""),
        address,
        notes: String(data.get("notes") ?? ""),
      });
      order.clear();
      setOpen(false);
      router.push(`/ordine/${placed.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.somethingWrong);
      setBusy(false);
    }
  }

  return (
    <>
      <MobileDock />
      {/* komputer: koszyk na dole, na środku, z paragonem */}
      <CartButton />

      <AnimatePresence>
        {isOpen ? (
          <>
            <motion.div className="fixed inset-0 z-[60] bg-ink/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} aria-hidden />
            <motion.div
              ref={panel}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              data-lenis-prevent
              className="scroll-pizza fixed inset-y-0 right-0 z-[61] flex w-full max-w-[34rem] flex-col overflow-y-auto bg-paper outline-none sm:inset-y-5 sm:right-5 sm:rounded-[2rem] sm:border-[2.5px] sm:border-ink sm:shadow-[0_10px_0_var(--color-ink)] lg:inset-y-8 lg:right-10 2xl:right-16"
              initial={reduced ? { opacity: 0 } : { x: "105%" }}
              animate={reduced ? { opacity: 1 } : { x: 0 }}
              exit={reduced ? { opacity: 0 } : { x: "105%" }}
              transition={{ duration: 0.6, ease: [0.76, 0, 0.24, 1] }}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b-[2.5px] border-ink bg-giallo px-6 py-4">
                <h2 id={titleId} className="text-3xl font-extrabold tracking-tight">
                  {t.order.title}
                </h2>
                <button type="button" onClick={() => setOpen(false)} className="btn-3d btn-3d-sm relative flex size-11 items-center justify-center rounded-full bg-ink text-paper">
                  <span className="sr-only">{t.common.close}</span>
                  <span aria-hidden className="absolute h-[3px] w-5 rotate-45 rounded bg-paper" />
                  <span aria-hidden className="absolute h-[3px] w-5 -rotate-45 rounded bg-paper" />
                </button>
              </div>

              {order.count === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
                  <PizzaArt {...ART.margherita} className="w-40 -rotate-12" />
                  <HandNote rotate={-4} className="mt-6">
                    {t.order.empty}
                  </HandNote>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      cheeseGo("#menu", t.nav.menu);
                    }}
                    className="btn-3d mt-6 inline-flex h-12 items-center rounded-full bg-ink px-6 font-bold text-paper"
                  >
                    {t.order.seeMenu}
                  </button>
                </div>
              ) : (
                <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-7 px-6 py-6">
                  <ul className="border-t-2 border-ink">
                    {order.lines.map(({ item, qty }) => (
                      <li key={item.id} className="flex items-center gap-3 border-b-2 border-ink py-3">
                        {item.art ? <PizzaArt {...ART[item.art]} className="size-12 shrink-0" /> : <span className="size-12 shrink-0 rounded-full bg-rosa" aria-hidden />}
                        <div className="min-w-0 flex-1">
                          <p className="leading-tight font-extrabold">{item.name}</p>
                          <p className="tabular text-sm font-semibold opacity-70">
                            {euro(item.price)} {t.common.each}
                          </p>
                        </div>
                        <div className="flex items-center rounded-full border-2 border-ink" role="group" aria-label={t.menu.quantity(item.name)}>
                          <button type="button" onClick={() => order.remove(item.id)} className="btn-3d btn-3d-sm flex size-8 items-center justify-center rounded-full bg-paper" aria-label={t.menu.removeOne(item.name)}>
                            <Minus />
                          </button>
                          <span className="tabular w-6 text-center font-extrabold">{qty}</span>
                          <button type="button" onClick={() => order.add(item.id)} className="btn-3d btn-3d-sm flex size-8 items-center justify-center rounded-full bg-giallo" aria-label={t.menu.addOne(item.name)}>
                            <Plus />
                          </button>
                        </div>
                        <p className="tabular w-20 text-right font-extrabold">{euro(qty * item.price)}</p>
                      </li>
                    ))}
                  </ul>

                  <fieldset>
                    <legend className="font-extrabold">{t.order.how}</legend>
                    <ModeToggle mode={order.mode} onChange={order.setMode} className="mt-3" />
                  </fieldset>

                  {order.mode === "domicilio" ? (
                    <div className="grid gap-4 rounded-[1.75rem] bg-cielo/40 p-4">
                      <LocateButton onAddress={setAddress} />
                      <Field label={t.order.address}>
                        <input
                          name="address"
                          required
                          minLength={5}
                          value={address}
                          onChange={(e) => {
                            setAddress(e.target.value);
                            if (order.located) order.forgetLocation();
                          }}
                          autoComplete="street-address"
                          placeholder={t.order.addressPlaceholder}
                          className={INPUT}
                        />
                      </Field>
                      <Field label={t.order.zone}>
                        <select value={order.zone?.id ?? ZONES[0].id} onChange={(e) => order.setZoneId(e.target.value)} className={`${INPUT} font-bold`}>
                          {ZONES.map((z) => (
                            <option key={z.id} value={z.id}>
                              {t.order.zoneOption(z.name, euro(z.fee), euro(z.minimum))}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  ) : (
                    <p className="rounded-[1.75rem] bg-menta px-5 py-4 font-semibold">
                      {t.order.pickupInfo(`${RESTAURANT.street}, ${RESTAURANT.city}`, RESTAURANT.prepMinutes + 5)}
                    </p>
                  )}

                  <div className="grid gap-4">
                    <Field label={t.order.name}>
                      <input name="name" required minLength={2} autoComplete="given-name" className={INPUT} />
                    </Field>
                    <Field label={t.order.phone}>
                      <input name="phone" type="tel" required autoComplete="tel" placeholder="+39 …" className={INPUT} />
                    </Field>
                    <EmailVerify inputClassName={INPUT} onVerifiedChange={setVerifiedEmail} />
                    <p className="font-hand -mt-1 text-lg leading-tight">{t.order.emailNote}</p>
                    <Field label={t.order.notes}>
                      <textarea name="notes" rows={2} maxLength={300} placeholder={t.order.notesPlaceholder} className={`${INPUT} h-auto resize-none py-3`} />
                    </Field>
                  </div>
                  
                  <div>
                    <p className="pb-2 font-extrabold">{t.order.payment}</p>
                    <PaymentPicker />
                  </div>

                  <dl className="tabular grid gap-1.5 text-lg font-semibold">
                    <div className="flex justify-between">
                      <dt>{t.order.subtotal}</dt>
                      <dd>{euro(order.subtotal)}</dd>
                    </div>
                    {order.zone ? (
                      <div className="flex justify-between">
                        <dt>{t.order.delivery}</dt>
                        <dd>{order.deliveryFee ? euro(order.deliveryFee) : t.common.free}</dd>
                      </div>
                    ) : null}
                    <div className="mt-2 flex items-baseline justify-between border-t-[2.5px] border-ink pt-3 text-3xl font-extrabold tracking-tight">
                      <dt>{t.order.total}</dt>
                      <dd>{euro(order.total)}</dd>
                    </div>
                  </dl>

                  <div className="mt-auto grid gap-3 pb-2">
                    <OpenStatus className="justify-self-center border-2 border-ink" />
                    {blockedReason ? (
                      <p className="rounded-2xl bg-rosa px-4 py-3 font-bold" role="status">
                        {blockedReason}
                      </p>
                    ) : order.zone && order.deliveryFee > 0 ? (
                      <p className="font-hand text-center text-xl">{t.order.almostFree(euro(RESTAURANT.freeDeliveryFrom - order.subtotal))}</p>
                    ) : null}
                    {error ? (
                      <p className="rounded-2xl bg-pomodoro px-4 py-3 font-bold" role="alert">
                        {error}
                      </p>
                    ) : null}

                    <button
                      type="submit"
                      disabled={!!blockedReason || busy}
                      className="btn-3d flex h-16 items-center justify-center gap-2 rounded-full bg-basilico text-lg font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy ? t.order.sending : t.order.submit(euro(order.total))}
                    </button>
                    <a href={RESTAURANT.phoneHref} className="text-center font-bold underline decoration-2 underline-offset-4">
                      {t.order.preferCall(RESTAURANT.phone)}
                    </a>
                    <p className="text-center text-sm font-semibold opacity-70">{t.order.noOnline}</p>
                  </div>
                </form>
              )}
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}

/** Telefon: stały dolny pasek; koszyk otwiera ten sam paragon co na komputerze. */
/**
 * Chowanie paska przy przewijaniu: dopiero za sekcją „Come funziona” pasek zjeżdża w dół,
 * gdy przewijasz w dół, i wraca płynnie od dołu, gdy przewijasz w górę. Wyżej zawsze widoczny.
 */
function useDockHidden(forceShow: boolean) {
  const [hidden, setHidden] = useState(false);
  const { scrollY } = useScroll();
  const threshold = useRef(Infinity);
  const lastTurn = useRef(0);
  const direction = useRef(0);

  useEffect(() => {
    const measure = () => {
      const steps = document.querySelector("#come-funziona");
      threshold.current = steps ? steps.getBoundingClientRect().bottom + window.scrollY : Infinity;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, []);

  useMotionValueEvent(scrollY, "change", (y) => {
    const prev = scrollY.getPrevious() ?? y;
    const past = y + window.innerHeight * 0.5 > threshold.current;
    if (!past) {
      lastTurn.current = y;
      return setHidden(false);
    }
    if (y === prev) return;
    // punkt zmiany kierunku + mała strefa martwa: drobne drgnięcia palca nie przełączają paska
    const dir = y > prev ? 1 : -1;
    if (dir !== direction.current) {
      direction.current = dir;
      lastTurn.current = prev;
    }
    if (dir === 1 && y - lastTurn.current > 24) setHidden(true);
    if (dir === -1 && lastTurn.current - y > 12) setHidden(false);
  });

  return hidden && !forceShow;
}

function MobileDock() {
  const order = useOrder();
  const t = useT();
  const reduced = useReducedMotion();
  const { open, setOpen, root } = useReceipt();
  const { el, y } = useCartDock();
  const panelId = useId();
  const hidden = useDockHidden(open);
  if (order.isOpen) return null;

  return (
    <motion.div
      ref={root}
      className="fixed inset-x-3 bottom-3 z-40 lg:hidden"
      initial={false}
      animate={{ y: hidden ? "140%" : "0%" }}
      transition={reduced ? { duration: 0 } : hidden ? { duration: 0.35, ease: [0.4, 0, 1, 1] } : { type: "spring", stiffness: 260, damping: 28 }}
    >
      <motion.div ref={el} style={{ y }} className="pb-[5px]">
      <ReceiptPopover open={open} id={panelId} onCheckout={() => setOpen(false)} className="inset-x-0 bottom-full mx-auto mb-4 w-[min(22rem,100%)]" />
      <nav aria-label={t.nav.quick} data-dock-target className="flex h-[4.25rem] items-center gap-1.5 rounded-full border-[2.5px] border-ink bg-paper px-1.5 pb-[3px] shadow-[0_5px_0_var(--color-ink)]">
        <button type="button" onClick={() => cheeseGo("#menu", t.nav.menu)} className="btn-3d btn-3d-sm flex h-12 flex-1 items-center justify-center rounded-full bg-paper font-extrabold">
          {t.nav.menu}
        </button>
        <a href={RESTAURANT.phoneHref} className="btn-3d btn-3d-sm flex size-12 shrink-0 items-center justify-center rounded-full bg-giallo" aria-label={`${t.common.call} ${RESTAURANT.phone}`}>
          <PhoneIcon />
        </a>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="btn-3d btn-3d-sm flex h-12 flex-[1.6] items-center justify-center gap-2 rounded-full bg-pomodoro pr-4 pl-1 font-extrabold"
        >
          <CartBadge count={order.count} dark />
          {order.count ? <span className="tabular">{euro(order.total)}</span> : <span className="sr-only">{t.order.cart}</span>}
        </button>
      </nav>
      </motion.div>
    </motion.div>
  );
}

const INPUT ="h-12 w-full rounded-2xl border-[2.5px] border-ink bg-paper px-4 font-semibold placeholder:text-ink/45";

function ModeToggle({ mode, onChange, compact = false, className = "" }: { mode: Mode; onChange: (m: Mode) => void; compact?: boolean; className?: string }) {
  const t = useT();
  return (
    <div className={`grid grid-cols-2 gap-1.5 ${className}`} role="radiogroup" aria-label={t.delivery.modeAria}>
      {(["domicilio", "ritiro"] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => onChange(m)}
          className={`btn-3d btn-3d-sm flex items-center justify-center rounded-full font-bold whitespace-nowrap ${compact ? "mb-[3px] h-10 px-3 text-sm" : "h-11"} ${
            mode === m ? "bg-ink text-paper" : "bg-paper hover:bg-giallo"
          }`}
        >
          {m === "domicilio" ? t.order.homeDelivery : t.order.pickup}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="font-extrabold">{label}</span>
      {children}
    </label>
  );
}
