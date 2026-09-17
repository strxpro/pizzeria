"use client";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform,
  useVelocity,
  type MotionValue,
  type PanInfo,
} from "motion/react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type WheelEvent } from "react";
import { type MenuItem } from "@/lib/data";
import { useMenu } from "@/lib/menu";
import { euro } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import { useOrder } from "@/lib/order";
import { CartDockSlot } from "./cart-receipt";
import { isIconName, ItemIcon } from "./ingredient-icons";
import { HandNote, Minus, Plus, RiseText } from "./kit";
import { Liquid } from "./liquid";
import { ART, PizzaArt } from "./pizza-art";

/** Ramka + wnętrze karty — pary jak okładki w karuzeli referencji. */
const CARDS = [
  { frame: "bg-notte", inner: "bg-cielo", text: "text-paper", icon: "text-notte" },
  { frame: "bg-basilico", inner: "bg-menta", text: "text-ink", icon: "text-basilico" },
  { frame: "bg-ink", inner: "bg-paper", text: "text-paper", icon: "text-ink" },
  { frame: "bg-pomodoro", inner: "bg-giallo", text: "text-ink", icon: "text-pomodoro" },
  { frame: "bg-rosa", inner: "bg-paper", text: "text-ink", icon: "text-rosa" },
] as const;
const TILT = [-4, 3, -2, 4, -3, 2];
const GAP = 24;

/**
 * Menu = sklep. Każda kategoria to karuzela przechylonych kart; dojechanie
 * za ostatnią kartę (strzałką, przeciągnięciem albo gładzikiem) przechodzi
 * do następnej kategorii, cofnięcie przed pierwszą — do poprzedniej.
 */
export function Menu() {
  const t = useT();
  const [active, setActive] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const reduced = useReducedMotion();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const { categories: MENU } = useMenu();
  const category = MENU[Math.min(active, MENU.length - 1)];

  const select = (i: number) => {
    if (i === active) return;
    setDir(i > active ? 1 : -1);
    setActive(i);
  };

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let next = active;
    if (event.key === "ArrowRight") next = (active + 1) % MENU.length;
    else if (event.key === "ArrowLeft") next = (active - 1 + MENU.length) % MENU.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = MENU.length - 1;
    else return;
    event.preventDefault();
    select(next);
    tabs.current[next]?.focus();
  }

  return (
    <section id="menu" className="relative isolate overflow-hidden bg-paper pb-10">
      <Liquid layers={[{ color: "#ffefd0", x: 60, y: 30, size: 60, seed: 8, duration: 24 }, { color: "#ffe9e4", x: -20, y: 55, size: 50, seed: 9, duration: 20 }]} />

      {/* Górny odstęp zostawia miejsce na ser topiący się z hero. */}
      <div className="container-page pt-[clamp(7rem,22vw,19rem)]">
        <div className="relative flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
          <div className="relative">
            <RiseText key={t.menu.title} text={t.menu.title} className="text-giant max-w-[9ch]" />
            <HandNote delay={0.3} rotate={-7} className="mt-3 lg:absolute lg:-top-10 lg:right-0 lg:mt-0 lg:translate-x-[40%]">
              {t.menu.note}
            </HandNote>
          </div>

          <div
            role="tablist"
            aria-label={t.menu.categoriesAria}
            onKeyDown={onKeyDown}
            className="-mx-(--spacing-gutter) flex w-[calc(100%+2*var(--spacing-gutter))] gap-2 overflow-x-auto px-(--spacing-gutter) pt-1 pb-3 [scrollbar-width:none] sm:mx-0 sm:w-auto sm:px-0 [&::-webkit-scrollbar]:hidden"
          >
            {MENU.map((c, i) => (
              <button
                key={c.id}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                role="tab"
                id={`tab-${c.id}`}
                aria-selected={i === active}
                aria-controls={`panel-${c.id}`}
                tabIndex={i === active ? 0 : -1}
                onClick={() => select(i)}
                className={`btn-3d relative h-12 shrink-0 rounded-full px-5 text-base font-extrabold ${i === active ? "bg-ink text-paper" : "bg-paper hover:bg-giallo"}`}
              >
                {t.menu.categories[c.id] ?? c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false} custom={dir}>
        <motion.div
          key={category.id}
          role="tabpanel"
          id={`panel-${category.id}`}
          aria-labelledby={`tab-${category.id}`}
          custom={dir}
          variants={{
            enter: (d: number) => ({ opacity: 0, x: 90 * d }),
            show: { opacity: 1, x: 0 },
            leave: (d: number) => ({ opacity: 0, x: -70 * d }),
          }}
          initial={reduced ? false : "enter"}
          animate="show"
          exit={reduced ? undefined : "leave"}
          transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
        >
          <Carousel
            items={category.items}
            startAtEnd={dir === -1}
            prevLabel={active > 0 ? t.menu.categories[MENU[active - 1].id] : null}
            nextLabel={active < MENU.length - 1 ? t.menu.categories[MENU[active + 1].id] : null}
            onPrev={() => active > 0 && select(active - 1)}
            onNext={() => active < MENU.length - 1 && select(active + 1)}
          />
        </motion.div>
      </AnimatePresence>

      <CartDockSlot />
    </section>
  );
}

/**
 * Karuzela z fizyką: przeciągnięcie ma bezwładność i dojeżdża sprężyście do pełnej
 * karty; karty przechylają się z prędkością toru. Tor przesuwa tylko `transform`.
 */
function Carousel({
  items,
  startAtEnd,
  prevLabel,
  nextLabel,
  onPrev,
  onNext,
}: {
  items: MenuItem[];
  startAtEnd: boolean;
  prevLabel: string | null;
  nextLabel: string | null;
  onPrev: () => void;
  onNext: () => void;
}) {
  const t = useT();
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLUListElement>(null);
  const x = useMotionValue(0);
  const velocity = useVelocity(x);
  const lean = useSpring(useTransform(velocity, [-2500, 0, 2500], [7, 0, -7], { clamp: true }), { stiffness: 260, damping: 22 });
  const [bounds, setBounds] = useState({ min: 0, step: 360 });
  const [edge, setEdge] = useState({ start: true, end: false });
  const dragging = useRef(false);
  const edgeAtDragStart = useRef({ start: true, end: false });
  const wheelLock = useRef(0);
  const placed = useRef(false);

  const measure = useCallback(() => {
    const card = track.current?.querySelector("li");
    if (!viewport.current || !track.current || !card) return;
    const min = Math.min(0, viewport.current.clientWidth - track.current.scrollWidth);
    setBounds({ min, step: card.offsetWidth + GAP });
    // Wejście z następnej kategorii „od tyłu” — ustaw tor na końcu.
    if (!placed.current) {
      placed.current = true;
      if (startAtEnd) x.set(min);
    }
  }, [startAtEnd, x]);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (viewport.current) ro.observe(viewport.current);
    return () => ro.disconnect();
  }, [measure]);

  // Dotyk (bez najechania): „aktywna” jest karta na środku — tylko jej ikona wychodzi i się kołysze.
  const [centered, setCentered] = useState<number | null>(null);
  useEffect(() => {
    if (window.matchMedia("(hover: hover)").matches || !viewport.current || !track.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setCentered(Number((e.target as HTMLElement).dataset.index));
      },
      { root: viewport.current, rootMargin: "0px -42% 0px -42%" },
    );
    track.current.querySelectorAll("li[data-index]").forEach((li) => io.observe(li));
    return () => io.disconnect();
  }, [items]);

  useMotionValueEvent(x, "change", (v) => {
    const start = v > -8;
    const end = v < bounds.min + 8;
    setEdge((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  });

  const snap = (target: number) => Math.max(bounds.min, Math.min(0, Math.round(target / bounds.step) * bounds.step));
  const glide = (to: number) => animate(x, snap(to), { type: "spring", stiffness: 190, damping: 28, mass: 0.9 });

  const go = (d: 1 | -1) => {
    const v = x.get();
    if (d === 1 && v <= bounds.min + 2) return onNext();
    if (d === -1 && v >= -2) return onPrev();
    glide(v - d * bounds.step);
  };

  const onWheel = (e: WheelEvent) => {
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY) || Math.abs(e.deltaX) < 12) return;
    const now = Date.now();
    if (now - wheelLock.current < 450) return;
    wheelLock.current = now;
    go(e.deltaX > 0 ? 1 : -1);
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    setTimeout(() => (dragging.current = false), 60);
    // Przeciągnięcie mocno za krawędź = kolejna kategoria.
    if (edgeAtDragStart.current.end && info.offset.x < -90 && nextLabel) onNext();
    else if (edgeAtDragStart.current.start && info.offset.x > 90 && prevLabel) onPrev();
  };

  return (
    <div className="relative">
      <div className="container-page flex items-center justify-end gap-2 pt-2 sm:pt-4">
        <p className="font-hand mr-auto text-xl max-sm:hidden" aria-live="polite">
          {edge.end && nextLabel ? t.menu.ahead(nextLabel) : edge.start && prevLabel ? t.menu.backTo(prevLabel) : t.menu.drag}
        </p>
        <ArrowButton label={edge.start && prevLabel ? t.menu.goTo(prevLabel) : t.menu.prev} disabled={edge.start && !prevLabel} onClick={() => go(-1)} flip />
        <ArrowButton label={edge.end && nextLabel ? t.menu.goTo(nextLabel) : t.menu.next} disabled={edge.end && !nextLabel} onClick={() => go(1)} />
      </div>

      {/* overflow-x: clip — ikony nad kartami i przyciski pod nimi nie są ucinane */}
      <div ref={viewport} onWheel={onWheel} className="overflow-x-clip pt-16 pb-20 sm:pt-44 sm:pb-24">
        <motion.ul
          ref={track}
          drag="x"
          style={{ x }}
          dragConstraints={{ left: bounds.min, right: 0 }}
          dragElastic={0.18}
          dragTransition={{ power: 0.3, timeConstant: 240, modifyTarget: snap, bounceStiffness: 260, bounceDamping: 30 }}
          onDragStart={() => {
            dragging.current = true;
            const v = x.get();
            edgeAtDragStart.current = { start: v >= -2, end: v <= bounds.min + 2 };
          }}
          onDragEnd={onDragEnd}
          onClickCapture={(e) => {
            if (dragging.current) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          className="flex w-max cursor-grab touch-pan-y gap-6 px-[max(var(--spacing-gutter),calc((100vw-96rem)/2+var(--spacing-gutter)))] select-none active:cursor-grabbing"
        >
          {items.map((item, i) => (
            <PizzaCard key={item.id} item={item} index={i} lean={lean} active={centered === i} onFocusCard={() => glide(-i * bounds.step)} />
          ))}
          {nextLabel ? (
            <li className="flex w-[min(45vw,11rem)] shrink-0 items-center sm:w-[15rem]">
              <button
                type="button"
                onClick={onNext}
                className="btn-3d flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-[1.5rem] border-dashed bg-paper p-4 text-center sm:gap-3 sm:rounded-[2rem] sm:p-6"
              >
                <span className="font-hand text-xl sm:text-2xl">{t.menu.andThen}</span>
                <span className="text-[1.5rem] leading-[0.9] font-extrabold tracking-tight sm:text-[2.2rem]">{nextLabel}</span>
                <span className="flex size-12 items-center justify-center rounded-full bg-ink text-paper">
                  <ArrowIcon />
                </span>
              </button>
            </li>
          ) : null}
        </motion.ul>
      </div>
    </div>
  );
}

function ArrowButton({ label, disabled, onClick, flip = false }: { label: string; disabled: boolean; onClick: () => void; flip?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="btn-3d flex size-12 items-center justify-center rounded-full bg-ink text-paper sm:size-14 disabled:border-ink/20 disabled:bg-ink/10 disabled:text-ink/35"
    >
      <ArrowIcon className={flip ? "rotate-180" : ""} />
    </button>
  );
}

function ArrowIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`size-6 ${className}`} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 12h15M13 5.5l6.5 6.5-6.5 6.5" />
    </svg>
  );
}

function PizzaCard({
  item,
  index,
  lean,
  active,
  onFocusCard,
}: {
  item: MenuItem;
  index: number;
  lean: MotionValue<number>;
  active: boolean;
  onFocusCard: () => void;
}) {
  const t = useT();
  const reduced = useReducedMotion();
  const tone = CARDS[index % CARDS.length];
  const tilt = TILT[index % TILT.length];
  const iconName = item.art ?? item.id;

  return (
    <motion.li
      data-index={index}
      data-card-active={active ? "" : undefined}
      style={reduced ? undefined : { rotate: lean }}
      onFocus={onFocusCard}
      className="group relative w-[min(55vw,15rem)] shrink-0 origin-bottom sm:w-[21rem]"
    >
      <motion.div
        className="relative h-full"
        initial={reduced ? false : { opacity: 0, y: 60, rotate: 0 }}
        whileInView={{ opacity: 1, y: index % 2 ? 18 : 0, rotate: tilt }}
        whileHover={reduced ? undefined : { rotate: 0, y: -14, transition: { type: "spring", stiffness: 300, damping: 18 } }}
        viewport={{ once: true, margin: "0px -5% 0px -5%" }}
        transition={{ type: "spring", stiffness: 90, damping: 16, delay: Math.min(index, 4) * 0.06 }}
      >
        {/* ikona tej pozycji wyskakuje zza karty — w kolorze ramki, co chwilę podskakuje */}
        {isIconName(iconName) ? (
          <div aria-hidden className={`card-icon pointer-events-none absolute -top-[3.4rem] left-1/2 -z-10 w-20 sm:-top-[6.75rem] sm:w-36 ${tone.icon}`}>
            <div className="icon-sway">
              <ItemIcon name={iconName} className="w-full" />
            </div>
          </div>
        ) : null}

        <article className={`relative flex h-full flex-col rounded-[1.5rem] p-2 pb-8 sm:rounded-[2rem] sm:p-3 sm:pb-9 ${tone.frame} ${tone.text}`}>
          <div className={`relative flex aspect-[4/3.4] items-center justify-center overflow-hidden rounded-[1.1rem] sm:rounded-[1.5rem] ${tone.inner}`}>
            {item.photo ? (
              // zdjęcie dodane w panelu admina zastępuje rysunek
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.photo} alt="" loading="lazy" draggable={false} className="absolute inset-0 size-full object-cover transition-transform duration-[900ms] ease-(--ease-out) group-hover:scale-[1.06]" />
            ) : null}
            {!item.photo && item.art ? (
              /* cień jako gradient pod pizzą — zamiast filtra, który przeliczałby się przy obrocie */
              <span aria-hidden className="absolute top-[60%] left-1/2 h-[26%] w-[70%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgb(18_12_8/0.3),transparent)]" />
            ) : null}
            {item.photo ? null : item.art ? (
              <PizzaArt
                {...ART[item.art]}
                className="relative w-[74%] transition-transform duration-[900ms] ease-(--ease-out) group-hover:scale-[1.08] group-hover:rotate-[40deg]"
              />
            ) : isIconName(iconName) ? (
              <ItemIcon name={iconName} className={`w-[48%] transition-transform duration-700 ease-(--ease-out) group-hover:-rotate-12 group-hover:scale-110 ${tone.icon}`} />
            ) : null}
          </div>

          <div className="flex flex-1 flex-col px-1.5 pt-3 pb-1 sm:px-2 sm:pt-4 sm:pb-2">
            <div className="flex flex-wrap gap-1.5">
              {item.tag ? <span className="rounded-full bg-giallo px-2 py-0.5 text-xs font-bold text-ink sm:px-2.5 sm:text-sm">{t.menu.tags[item.tag] ?? item.tag}</span> : null}
              {item.art ? <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-bold text-ink sm:px-2.5 sm:text-sm">{t.menu.rise}</span> : null}
            </div>
            <h3 className="mt-2 text-[1.5rem] leading-[0.9] font-extrabold tracking-tight sm:text-[2.1rem]">{item.name}</h3>
            <p className="mt-1.5 text-sm leading-snug font-semibold opacity-85 sm:mt-2 sm:text-base">{t.menu.items[item.id] ?? item.description}</p>
            <p className="tabular mt-auto pt-3 text-2xl font-extrabold sm:pt-5 sm:text-3xl">{euro(item.price)}</p>
          </div>

          {/* „dodaj do zamówienia” wysuwa się spod karty przy najechaniu (na dotyku widoczny zawsze) */}
          <CardAdd item={item} />
        </article>
      </motion.div>
    </motion.li>
  );
}

function CardAdd({ item }: { item: MenuItem }) {
  const t = useT();
  const { qtyOf, add, remove } = useOrder();
  const qty = qtyOf(item.id);

  return (
    <div className="card-pop absolute top-full left-1/2 -mt-7" data-active={qty > 0 ? "" : undefined}>
      {qty === 0 ? (
        <button type="button" onClick={() => add(item.id)} className="btn-3d flex h-11 items-center gap-1.5 rounded-full bg-giallo pr-4 pl-3 text-sm font-extrabold whitespace-nowrap text-ink sm:h-14 sm:gap-2 sm:pr-6 sm:pl-4 sm:text-lg">
          <Plus />
          {t.menu.add}
          <span className="sr-only">: {item.name}</span>
        </button>
      ) : (
        <div className="btn-3d flex h-11 items-center gap-1.5 rounded-full bg-giallo px-1.5 text-sm text-ink sm:h-14 sm:gap-2 sm:px-2 sm:text-base" role="group" aria-label={t.menu.quantity(item.name)}>
          <button type="button" onClick={() => remove(item.id)} className="btn-3d btn-3d-sm flex size-8 items-center justify-center rounded-full bg-paper sm:size-9" aria-label={t.menu.removeOne(item.name)}>
            <Minus />
          </button>
          <span className="tabular min-w-[4.5rem] text-center font-extrabold whitespace-nowrap sm:min-w-[5.5rem]" aria-live="polite">
            {t.menu.inOrder(qty)}
          </span>
          <button type="button" onClick={() => add(item.id)} className="btn-3d btn-3d-sm flex size-8 items-center justify-center rounded-full bg-ink text-paper sm:size-9" aria-label={t.menu.addOne(item.name)}>
            <Plus />
          </button>
        </div>
      )}
    </div>
  );
}

export { Minus, Plus };
