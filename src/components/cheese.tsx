"use client";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/provider";
import { ART, PizzaArt } from "./pizza-art";
import { scrollToTarget } from "./smooth-scroll";

/*
 * Topiąca się krawędź: jedna gładka ścieżka SVG z „językami” roztopionego sera.
 * Każdy język to dwie krzywe Béziera z poziomą styczną przy barku i na czubku,
 * więc kształt jest miękki bez żadnych filtrów. Przy przewijaniu zmienia się
 * tylko długość języków — jedna prosta ścieżka, tania do narysowania w każdej klatce.
 */

/** [środek x, połowa szerokości, długość bazowa, jak mocno rośnie] w układzie 1440 × 400. */
const TONGUES = [
  [60, 46, 70, 0.7], [170, 58, 150, 1.1], [290, 40, 90, 0.8], [400, 64, 210, 1.3], [520, 38, 80, 0.6],
  [630, 56, 170, 1.2], [745, 44, 110, 0.9], [860, 66, 240, 1.4], [985, 40, 95, 0.7], [1095, 58, 185, 1.2],
  [1215, 44, 120, 0.9], [1330, 60, 200, 1.3], [1420, 30, 60, 0.5],
] as const;

const r1 = (n: number) => Math.round(n * 10) / 10;

export function meltPath(stretch: number) {
  const b = 8;
  let d = `M-10 -4 L-10 ${b}`;
  for (const [x, w, len, grow] of TONGUES) {
    const l = r1(len * (0.35 + stretch * grow));
    d += ` L${x - w} ${b} C${r1(x - w * 0.42)} ${b} ${r1(x - w * 0.62)} ${b + l} ${x} ${b + l} C${r1(x + w * 0.62)} ${b + l} ${r1(x + w * 0.42)} ${b} ${x + w} ${b}`;
  }
  return `${d} L1450 ${b} L1450 -4 Z`;
}

/**
 * Krawędź sera przyklejona do górnej krawędzi rodzica, języki zwisają w dół.
 * Pod spodem leży druga, odrobinę dłuższa ścieżka w ciemniejszym odcieniu — daje
 * cień i grubość sera na czubkach języków, bez filtrów i bez linii przy krawędzi.
 */
export function MeltEdge({ stretch, className = "", flip = false }: { stretch: MotionValue<number>; className?: string; flip?: boolean }) {
  const shade = useRef<SVGPathElement>(null);
  const body = useRef<SVGPathElement>(null);
  // Ścieżkę przerysowujemy dopiero przy widocznej zmianie długości — przy małych drganiach
  // sprężyny SVG na całą szerokość ekranu nie maluje się od nowa w każdej klatce.
  const last = useRef(stretch.get());
  useMotionValueEvent(stretch, "change", (v) => {
    if (Math.abs(v - last.current) < 0.012) return;
    last.current = v;
    shade.current?.setAttribute("d", meltPath(v * 1.08 + 0.06));
    body.current?.setAttribute("d", meltPath(v));
  });
  const v = stretch.get();

  return (
    <svg
      aria-hidden
      viewBox="0 0 1440 400"
      preserveAspectRatio="none"
      className={`pointer-events-none block h-[clamp(110px,24vw,360px)] w-full overflow-visible ${flip ? "-scale-y-100" : ""} ${className}`}
    >
      <path ref={shade} d={meltPath(v * 1.08 + 0.06)} fill="var(--color-cheese-shade)" />
      <path ref={body} d={meltPath(v)} fill="currentColor" />
    </svg>
  );
}

/**
 * Przejście z hero do menu: żółty ser z hero topi się na menu.
 * Im dalej przewijasz, tym dłuższe języki; sprężyna wygładza każdy ruch kółka.
 */
export function MeltDivider() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start start"] });
  const target = useTransform(scrollYProgress, [0, 1], [0.35, 1.7]);
  const spring = useSpring(target, { stiffness: 80, damping: 22, mass: 0.8 });
  const still = useMotionValue(1);

  return (
    <div ref={ref} aria-hidden className="relative z-[5] h-0 text-giallo">
      <div className="absolute inset-x-0 -top-px">
        <MeltEdge stretch={reduced ? still : spring} />
      </div>
    </div>
  );
}

/* ---------- zasłona przy skoku do sekcji ---------- */

type Jump = { target: string; label: string; line: number; key: number };

let trigger: ((target: string, label: string) => void) | null = null;

/** Skok do sekcji za serową zasłoną. Bez zamontowanej zasłony — zwykłe przewinięcie. */
export function cheeseGo(target: string, label: string) {
  if (trigger) trigger(target, label);
  else scrollToTarget(target);
}

export function CheeseTransition() {
  const t = useT();
  const reduced = useReducedMotion();
  const [jump, setJump] = useState<Jump | null>(null);
  const count = useRef(0);
  const y = useMotionValue(-1.4); // pozycja zasłony w wysokościach ekranu
  const massY = useTransform(y, (v) => `${v * 100}%`);
  // Języki najdłuższe w ruchu, krótkie, gdy zasłona stoi.
  const stretch = useTransform(y, [-1.4, 0, 1.4], [1.6, 0.5, 1.6]);

  useEffect(() => {
    trigger = (target, label) => {
      if (reduced) {
        scrollToTarget(target, { immediate: true });
        return;
      }
      count.current += 1;
      setJump({ target, label, line: count.current, key: count.current });
    };
    return () => {
      trigger = null;
    };
  }, [reduced]);

  useEffect(() => {
    if (!jump) return;
    let cancelled = false;
    (async () => {
      y.set(-1.4);
      await animate(y, 0, { duration: 0.65, ease: [0.7, 0, 0.25, 1] });
      if (cancelled) return;
      scrollToTarget(jump.target, { immediate: true });
      history.replaceState(null, "", jump.target);
      await new Promise((r) => setTimeout(r, 240));
      if (cancelled) return;
      await animate(y, 1.4, { duration: 0.75, ease: [0.7, 0, 0.25, 1] });
      if (!cancelled) setJump(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [jump, y]);

  return (
    <AnimatePresence>
      {jump ? (
        <motion.div key={jump.key} role="status" aria-live="polite" className="fixed inset-0 z-[90] overflow-hidden" exit={{ opacity: 0, transition: { duration: 0.1 } }}>
          <motion.div style={{ y: massY }} className="absolute inset-0 bg-giallo text-giallo will-change-transform">
            <div className="absolute inset-x-0 bottom-full">
              <MeltEdge stretch={stretch} flip />
            </div>
            <div className="relative flex h-full flex-col items-center justify-center gap-6 px-6 text-center text-ink">
              <PizzaArt {...ART.margherita} className="w-[min(32vw,11rem)] animate-[spin_1.6s_linear_infinite]" />
              <p className="text-[clamp(2.4rem,7vw,6rem)] leading-[0.9] font-extrabold tracking-tight">{t.cheese.lines[jump.line % t.cheese.lines.length]}</p>
              <p className="font-hand text-2xl -rotate-3">{t.cheese.going(jump.label)}</p>
            </div>
            <div className="absolute inset-x-0 top-full -mt-px">
              <MeltEdge stretch={stretch} />
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
