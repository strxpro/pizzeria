"use client";

import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform, type PanInfo } from "motion/react";
import { useState } from "react";
import { useT } from "@/lib/i18n/provider";
import { HandNote, Pill, RiseText } from "./kit";
import { Liquid } from "./liquid";

const CARDS = [
  { bg: "bg-cielo", tilt: -3, Art: ArtMenu },
  { bg: "bg-pomodoro", tilt: 2.5, Art: ArtPhone },
  { bg: "bg-giallo", tilt: -2, Art: ArtOven },
  { bg: "bg-basilico", tilt: 3, Art: ArtHome },
] as const;

/**
 * „Jak to działa” — bez przewijania i bez przypinania.
 *
 * Komputer: cztery karty w rzędzie; kliknięta rozszerza się (reszta się zwęża
 * do numeru i tytułu), więc tekst czyta się wygodnie w dużym rozmiarze.
 * Telefon: talia nakładających się kart — przerzucasz palcem albo kropkami.
 */
export function Steps() {
  const t = useT();

  return (
    <section id="come-funziona" className="panel relative isolate overflow-hidden bg-rosa py-(--spacing-section)">
      <Liquid layers={[{ color: "#ffe6f0", x: -15, y: 25, size: 70, seed: 11, duration: 19 }, { color: "#ffc3d9", x: 55, y: -20, size: 65, seed: 12, duration: 23 }]} />

      <div className="container-page">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <RiseText key={t.steps.title} text={t.steps.title} className="text-giant" />
            <HandNote rotate={-3} className="mt-2">
              {t.steps.note}
            </HandNote>
          </div>
          <Pill href="#menu" tone="ink" className="max-sm:hidden">
            {t.steps.cta}
          </Pill>
        </div>

        <StepsDeck />
        <StepsRow />
      </div>
    </section>
  );
}

/** Komputer: rząd kart, kliknięta się rozszerza. */
function StepsRow() {
  const t = useT();
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);

  return (
    <ol className="mt-14 hidden h-[31rem] gap-3 lg:flex">
      {t.steps.list.map((step, i) => {
        const { bg, tilt, Art } = CARDS[i];
        const on = active === i;
        return (
          <motion.li
            key={i}
            className="relative min-w-0"
            style={{ flexBasis: 0 }}
            initial={false}
            animate={{ flexGrow: on ? 3.4 : 1, rotate: on ? 0 : tilt, y: on ? 0 : i % 2 ? 10 : 0 }}
            whileHover={reduced || on ? undefined : { y: -10, rotate: 0 }}
            transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 240, damping: 28 }}
          >
            <button
              type="button"
              aria-expanded={on}
              onClick={() => setActive(i)}
              className={`relative flex h-full w-full overflow-hidden rounded-[2rem] border-[2.5px] border-ink text-left transition-shadow duration-300 ${bg} ${
                on ? "shadow-[0_12px_0_var(--color-ink)]" : "shadow-[0_6px_0_var(--color-ink)] hover:shadow-[0_10px_0_var(--color-ink)]"
              }`}
            >
              {/* zwężona: numer, tytuł pionowo, mały rysunek */}
              <span
                aria-hidden={on}
                className={`absolute inset-0 flex flex-col items-center justify-between p-5 transition-opacity duration-200 ${on ? "pointer-events-none opacity-0" : "opacity-100 delay-150"}`}
              >
                <span className="tabular text-6xl leading-none font-extrabold">{i + 1}</span>
                <span className="text-[2.2rem] leading-none font-extrabold tracking-tight [writing-mode:vertical-rl] rotate-180">{step.title}</span>
                <Art className="h-16 w-auto" />
              </span>

              {/* rozszerzona: stała szerokość treści, więc tekst nie „pływa” w trakcie animacji */}
              <AnimatePresence>
                {on ? (
                  <motion.span
                    key="open"
                    className="absolute inset-y-0 left-0 flex w-[min(34rem,44vw)] flex-col p-8"
                    initial={reduced ? false : { opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0, transition: { delay: 0.18, duration: 0.35 } }}
                    exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  >
                    <span className="font-hand text-2xl">{t.steps.step(i + 1)}</span>
                    <span className="flex min-h-0 flex-1 items-center justify-center py-3">
                      <Art className="h-full max-h-48 w-auto" animated />
                    </span>
                    <span className="block text-[3.2rem] leading-[0.9] font-extrabold tracking-tight">{step.title}</span>
                    <span className="mt-3 block max-w-[34ch] text-xl leading-snug font-semibold">{step.text}</span>
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </button>
          </motion.li>
        );
      })}
    </ol>
  );
}

/** Telefon: talia nakładających się kart. */
function StepsDeck() {
  const t = useT();
  const [order, setOrder] = useState([0, 1, 2, 3]);
  const next = () => setOrder((o) => [...o.slice(1), o[0]]);
  const show = (i: number) => setOrder((o) => [...o.slice(o.indexOf(i)), ...o.slice(0, o.indexOf(i))]);

  return (
    <div className="mt-10 lg:hidden">
      {/* karty pod spodem wystają na zmianę z prawej i z lewej; rzucona wraca na spód talii */}
      <div className="relative mx-auto h-[25rem] max-w-[22rem]">
        {CARDS.map((_, index) => (
          <DeckCard key={index} index={index} depth={order.indexOf(index)} onThrow={next} />
        ))}
      </div>

      <div className="mt-10 flex items-center justify-center gap-2" role="tablist" aria-label={t.steps.title}>
        {t.steps.list.map((s, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={order[0] === i}
            aria-label={`${i + 1}. ${s.title}`}
            onClick={() => show(i)}
            className={`btn-3d btn-3d-sm tabular size-11 rounded-full text-base font-extrabold ${order[0] === i ? "bg-ink text-paper" : "bg-paper"}`}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <HandNote rotate={-2} className="mt-3 text-center">
        {t.steps.swipe}
      </HandNote>
    </div>
  );
}

/** Przesunięcie kart w talii: [x w px, obrót] dla głębokości 0–3 — naprzemiennie w prawo i w lewo. */
const FAN = [
  [0, 0],
  [22, 5],
  [-22, -5],
  [12, 2.5],
] as const;

function DeckCard({ index, depth, onThrow }: { index: number; depth: number; onThrow: () => void }) {
  const t = useT();
  const reduced = useReducedMotion();
  const drag = useMotionValue(0);
  const dragRotate = useTransform(drag, [-260, 0, 260], [-14, 0, 14]);
  const { bg, Art } = CARDS[index];
  const step = t.steps.list[index];
  const top = depth === 0;
  const [fx, fr] = FAN[depth] ?? FAN[3];

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const dir = Math.sign(info.offset.x || info.velocity.x) || 1;
    if (Math.abs(info.offset.x) > 80 || Math.abs(info.velocity.x) > 450) {
      // odlatuje w bok, a gdy już jest na spodzie talii — sprężyście wraca pod pozostałe karty
      animate(drag, dir * 380, { duration: 0.24, ease: [0.3, 0, 0.6, 1] }).then(() => {
        onThrow();
        animate(drag, 0, { type: "spring", stiffness: 170, damping: 22 });
      });
    } else {
      animate(drag, 0, { type: "spring", stiffness: 500, damping: 30 });
    }
  };

  return (
    <motion.div
      aria-hidden={!top}
      className={`absolute inset-0 ${top ? "" : "pointer-events-none"}`}
      style={{ zIndex: 10 - depth }}
      initial={false}
      animate={{ x: fx, rotate: fr, y: depth * 10, scale: 1 - depth * 0.04 }}
      transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 210, damping: 22 }}
    >
      <motion.article
        className={`flex h-full flex-col rounded-[2rem] border-[2.5px] border-ink p-6 shadow-[0_8px_0_var(--color-ink)] ${bg} ${top ? "cursor-grab touch-pan-y active:cursor-grabbing" : ""}`}
        style={{ x: drag, rotate: dragRotate }}
        drag={top && !reduced ? "x" : false}
        dragSnapToOrigin={false}
        onDragEnd={onDragEnd}
      >
        <div className="flex items-center justify-between">
          <p className="font-hand text-2xl">{t.steps.step(index + 1)}</p>
          <p className="tabular rounded-full border-2 border-ink bg-paper px-2.5 py-0.5 text-sm font-extrabold">{index + 1} / 4</p>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center py-2">
          <Art className={`h-full max-h-36 w-auto transition-transform duration-500 ${top ? "scale-100" : "scale-90"}`} animated={top} />
        </div>
        <h3 className="text-[2.2rem] leading-[0.9] font-extrabold tracking-tight">{step.title}</h3>
        <p className="mt-2 text-[1.02rem] leading-snug font-semibold">{step.text}</p>
      </motion.article>
    </motion.div>
  );
}

/* Ilustracje: gruba kreska + płaskie wypełnienia, jak rysunki w kartach referencji.
   `animated` włącza delikatny ruch detali (tylko transform w CSS) na aktywnej karcie. */
const S = { stroke: "#120c08", strokeWidth: 5, strokeLinecap: "round", strokeLinejoin: "round" } as const;
type ArtProps = { className?: string; animated?: boolean };

function ArtMenu({ className, animated = false }: ArtProps) {
  return (
    <svg viewBox="0 0 160 140" className={className} aria-hidden data-animated={animated || undefined}>
      <g className="art-sway">
        <rect x="26" y="12" width="84" height="116" rx="10" fill="#fff8ec" {...S} transform="rotate(-8 68 70)" />
        <path d="M44 42h40M42 60h46M40 78h34M38 96h24" {...S} transform="rotate(-8 68 70)" />
      </g>
      <g className="art-pop">
        <circle cx="118" cy="94" r="30" fill="#ffcf3f" {...S} />
        <path d="M118 80v28M104 94h28" {...S} />
      </g>
    </svg>
  );
}

function ArtPhone({ className, animated = false }: ArtProps) {
  return (
    <svg viewBox="0 0 160 140" className={className} aria-hidden data-animated={animated || undefined}>
      <rect x="44" y="6" width="72" height="128" rx="14" fill="#fff8ec" {...S} />
      <path d="M70 20h20" {...S} />
      <path d="M56 112h48" {...S} strokeWidth={4} opacity={0.35} />
      <g className="art-bounce">
        <path d="M80 36c-14 0-24 10-24 23 0 17 24 39 24 39s24-22 24-39c0-13-10-23-24-23Z" fill="#ff5a36" {...S} />
        <circle cx="80" cy="58" r="8" fill="#fff8ec" {...S} strokeWidth={4} />
      </g>
      <g className="art-sway">
        <path d="M8 100h30M14 114h24" {...S} />
        <path d="M122 92l12-12 22 4-8 22Z" fill="#9fe3ff" {...S} />
      </g>
    </svg>
  );
}

function ArtOven({ className, animated = false }: ArtProps) {
  return (
    <svg viewBox="0 0 160 140" className={className} aria-hidden data-animated={animated || undefined}>
      <path d="M14 128V74a66 66 0 0 1 132 0v54Z" fill="#ff5a36" {...S} />
      <path d="M36 60h88" {...S} strokeWidth={4} opacity={0.35} />
      <path d="M46 128V90a34 34 0 0 1 68 0v38" fill="#120c08" {...S} />
      <path className="art-flicker" d="M80 124c-16 0-22-12-16-24 4-8 10-10 10-22 12 8 22 18 22 30 0 10-6 16-16 16Z" fill="#ffcf3f" {...S} strokeWidth={4} />
      <g className="art-steam">
        <path d="M66 22c-4-6 4-10 0-16M80 20c-4-6 4-10 0-16M94 22c-4-6 4-10 0-16" fill="none" {...S} strokeWidth={4} />
      </g>
    </svg>
  );
}

function ArtHome({ className, animated = false }: ArtProps) {
  return (
    <svg viewBox="0 0 160 140" className={className} aria-hidden data-animated={animated || undefined}>
      <path d="M20 68 80 16l60 52" fill="none" {...S} />
      <path d="M34 58v70h92V58" fill="#fff8ec" {...S} />
      <path d="M68 128V104h24v24" fill="#9fe3ff" {...S} strokeWidth={4} />
      <g className="art-bounce">
        <rect x="44" y="78" width="72" height="16" rx="3" fill="#ffcf3f" {...S} />
        <path d="M50 78l6-14h48l6 14" fill="#ff5a36" {...S} />
      </g>
    </svg>
  );
}
