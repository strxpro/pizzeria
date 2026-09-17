"use client";

import { animate, motion, useAnimationFrame, useMotionValue, useReducedMotion, useSpring, useTransform, type AnimationPlaybackControls } from "motion/react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useT } from "@/lib/i18n/provider";
import { useIntroDone } from "@/lib/intro";
import { ItemIcon, type IconName } from "./ingredient-icons";
import { HandNote, Pill, RiseText } from "./kit";
import { Liquid } from "./liquid";
import { OpenStatus } from "./open-status";
import { ART, PizzaArt } from "./pizza-art";

const EASE = [0.16, 1, 0.3, 1] as const;

/** Składniki krążące wokół pizzy: ikona, kolor, kąt na orbicie. Na telefonie widać pierwsze cztery. */
const TOPPINGS: { icon: IconName; color: string; angle: number }[] = [
  { icon: "margherita", color: "#3f8f3a", angle: -35 },
  { icon: "marinara", color: "#e8452c", angle: 30 },
  { icon: "funghi", color: "#8d6a4a", angle: 150 },
  { icon: "bufalina", color: "#fff8ec", angle: 215 },
  { icon: "diavola", color: "#c62e1f", angle: 95 },
  { icon: "tartufo", color: "#3d3128", angle: 270 },
];

/**
 * Hero: krótki nagłówek, jedno zdanie, jeden przycisk — i duża pizza, którą da się kręcić.
 *
 * Pizza obraca się powoli sama; złapana palcem albo myszą kręci się jak płyta (kąt liczony
 * względem środka), po puszczeniu rozpędzona zwalnia z bezwładnością. Stuknięcie wyrzuca
 * składniki z orbity. Na komputerze pizza lekko pochyla się w stronę kursora.
 * Wszystko to transformacje jednej warstwy — bez przerysowywania — i nic nie liczy się poza ekranem.
 */
export function Hero() {
  const t = useT();
  const reduced = useReducedMotion();
  const ready = useIntroDone();

  const enter = (delay: number) =>
    reduced ? {} : { initial: { opacity: 0, y: 18 }, animate: ready ? { opacity: 1, y: 0 } : undefined, transition: { duration: 0.7, delay, ease: EASE } };

  return (
    <section id="top" className="relative isolate z-10 flex min-h-[100svh] flex-col overflow-x-clip bg-giallo">
      <Liquid
        layers={[
          { color: "#ffe38a", x: -30, y: 5, size: 90, seed: 1, duration: 22 },
          { color: "#ffb326", x: 55, y: -25, size: 75, seed: 2, duration: 26, opacity: 0.7 },
        ]}
      />
      {/* dół czysto żółty — ser pod hero zlewa się z tłem */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-1/3 bg-gradient-to-b from-transparent to-giallo" />

      <div className="container-page relative grid flex-1 items-center gap-6 pt-24 pb-10 sm:pt-28 lg:grid-cols-[1fr_1fr] lg:gap-10 lg:pb-16">
        <div className="relative z-10 flex flex-col items-start">
          <motion.div {...enter(0.2)}>
            <OpenStatus />
          </motion.div>
          <RiseText key={t.hero.title} as="h1" immediate play={ready} delay={0.3} text={t.hero.title} className="text-mega mt-5 max-w-[9ch]" />
          <motion.p {...enter(0.55)} className="mt-5 max-w-[30ch] text-lg leading-snug font-semibold sm:text-xl">
            {t.hero.lead}
          </motion.p>
          <motion.div {...enter(0.65)} className="mt-7 flex flex-wrap items-center gap-3">
            <Pill href="#menu" tone="ink" size="lg">
              {t.hero.order}
            </Pill>
          </motion.div>
        </div>

        <div className="relative flex justify-center">
          <SpinPizza ready={ready} hint={t.hero.note} />
        </div>
      </div>
    </section>
  );
}

function SpinPizza({ ready, hint }: { ready: boolean; hint: string }) {
  const reduced = useReducedMotion();
  const area = useRef<HTMLDivElement>(null);
  const rotate = useMotionValue(0);
  const orbit = useTransform(rotate, (r) => r * 0.35);
  const tiltX = useSpring(0, { stiffness: 120, damping: 16 });
  const tiltY = useSpring(0, { stiffness: 120, damping: 16 });
  const squash = useSpring(1, { stiffness: 500, damping: 14 });
  const [burst, setBurst] = useState(0);
  const [touched, setTouched] = useState(false);

  const visible = useRef(true);
  const drag = useRef<{ angle: number; time: number; velocity: number; moved: number } | null>(null);
  const inertia = useRef<AnimationPlaybackControls | null>(null);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => (visible.current = e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Powolny obrót, gdy nikt nie kręci (12°/s). Poza ekranem stoi.
  useAnimationFrame((_, delta) => {
    if (reduced || !ready || !visible.current || drag.current || inertia.current) return;
    rotate.set(rotate.get() + Math.min(delta, 50) * 0.012);
  });

  const angleOf = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (reduced) return;
    inertia.current?.stop();
    inertia.current = null;
    drag.current = { angle: angleOf(e), time: performance.now(), velocity: 0, moved: 0 };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* wskaźnik już zniknął — kręcenie zadziała bez przechwycenia */
    }
  };

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) {
      // komputer: delikatne pochylenie w stronę kursora
      if (e.pointerType === "mouse" && !reduced) {
        const r = e.currentTarget.getBoundingClientRect();
        tiltY.set(((e.clientX - r.left) / r.width - 0.5) * 16);
        tiltX.set(-((e.clientY - r.top) / r.height - 0.5) * 16);
      }
      return;
    }
    const angle = angleOf(e);
    let step = angle - d.angle;
    if (step > 180) step -= 360;
    if (step < -180) step += 360;
    const now = performance.now();
    const dt = Math.max(1, now - d.time);
    rotate.set(rotate.get() + step);
    d.velocity = d.velocity * 0.6 + (step / dt) * 1000 * 0.4; // °/s, wygładzone
    d.moved += Math.abs(step);
    d.angle = angle;
    d.time = now;
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    setTouched(true);
    if (d.moved < 4) {
      // stuknięcie: pizza podskakuje, składniki odlatują i wracają
      squash.set(0.9);
      setTimeout(() => squash.set(1), 90);
      setBurst((n) => n + 1);
      return;
    }
    const velocity = Math.max(-1800, Math.min(1800, d.velocity));
    inertia.current = animate(rotate, rotate.get(), {
      type: "inertia",
      velocity,
      power: 0.8,
      timeConstant: 900,
      onComplete: () => {
        inertia.current = null;
      },
    });
  };

  const transform = useTransform(() => `perspective(1200px) rotateX(${tiltX.get()}deg) rotateY(${tiltY.get()}deg) scale(${squash.get()})`);

  return (
    <motion.div
      initial={reduced ? false : { scale: 0.6, rotate: -60, opacity: 0 }}
      animate={ready || reduced ? { scale: 1, rotate: 0, opacity: 1 } : undefined}
      transition={{ type: "spring", stiffness: 70, damping: 15, delay: 0.25 }}
      className="relative aspect-square w-[min(86vw,34rem)] lg:w-[min(40vw,36rem)]"
    >
      {/* cień: gradient, nie filtr */}
      <div aria-hidden className="absolute inset-x-[10%] -bottom-[4%] h-[18%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(120_60_0/0.35),transparent)]" />

      <div
        ref={area}
        role="img"
        aria-label="Pizza"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={() => {
          tiltX.set(0);
          tiltY.set(0);
        }}
        className="absolute inset-[9%] cursor-grab touch-pan-y select-none active:cursor-grabbing"
      >
        <motion.div style={{ transform }} className="size-full">
          <motion.div style={{ rotate }} className="size-full">
            <PizzaArt {...ART.bufalina} className="pointer-events-none size-full" />
          </motion.div>
        </motion.div>
      </div>

      {/* orbita składników — obraca się wolniej niż pizza */}
      <motion.div aria-hidden style={{ rotate: orbit }} className="pointer-events-none absolute inset-0">
        {TOPPINGS.map((tp, i) => (
          <Topping key={tp.icon} {...tp} index={i} burst={burst} ready={ready} />
        ))}
      </motion.div>

      <motion.div
        aria-hidden
        initial={false}
        animate={{ opacity: touched ? 0 : 1, y: touched ? -6 : 0 }}
        transition={{ duration: 0.4 }}
        className="pointer-events-none absolute -top-2 left-0 flex items-end gap-1 sm:top-[4%] sm:-left-[4%]"
      >
        <HandNote rotate={-10} delay={1.4} className="text-2xl">
          {hint}
        </HandNote>
        <svg viewBox="0 0 60 50" className="mb-2 hidden w-12 text-ink sm:block" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
          <path d="M4 8c22-6 42 6 46 30" />
          <path d="M40 32l10 8 4-12" />
        </svg>
      </motion.div>
    </motion.div>
  );
}

function Topping({ icon, color, angle, index, burst, ready }: { icon: IconName; color: string; angle: number; index: number; burst: number; ready: boolean }) {
  const reduced = useReducedMotion();
  const rad = (angle * Math.PI) / 180;
  const x = 50 + Math.cos(rad) * 47;
  const y = 50 + Math.sin(rad) * 47;
  const out = { x: Math.round(Math.cos(rad) * 60), y: Math.round(Math.sin(rad) * 60) };

  return (
    <div className={`absolute ${index >= 4 ? "max-sm:hidden" : ""}`} style={{ left: `${x}%`, top: `${y}%` }}>
      <motion.div
        key={burst}
        initial={reduced ? false : burst ? { x: 0, y: 0, scale: 1 } : { scale: 0, rotate: -90 }}
        animate={
          burst && !reduced
            ? { x: [0, out.x, 0], y: [0, out.y, 0], scale: [1, 1.35, 1], rotate: [0, 40, 0] }
            : ready || reduced
              ? { scale: 1, rotate: 0 }
              : undefined
        }
        transition={burst ? { duration: 0.9, ease: [0.2, 0.9, 0.3, 1], times: [0, 0.35, 1] } : { type: "spring", stiffness: 260, damping: 14, delay: 0.7 + index * 0.08 }}
        className="-translate-x-1/2 -translate-y-1/2"
      >
        <span className="hero-bob block" style={{ color, animationDelay: `${index * -0.6}s` }}>
          <ItemIcon name={icon} className="size-[clamp(2.6rem,9vw,4.5rem)] drop-shadow-[0_6px_0_rgb(18_12_8/0.18)]" />
        </span>
      </motion.div>
    </div>
  );
}

export function PhoneIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z" />
    </svg>
  );
}
