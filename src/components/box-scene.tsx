"use client";

import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useEffect, useRef, type CSSProperties, type PointerEvent } from "react";
import { RESTAURANT } from "@/lib/data";
import { useT } from "@/lib/i18n/provider";
import { HandNote } from "./kit";
import { Liquid } from "./liquid";
import { ART, PizzaArt } from "./pizza-art";
import { PizzaBox } from "./pizza-box";

/** Kąty w końcowym ujęciu: wieczko + pochylenie sceny = 180°, więc spód wieczka patrzy prosto na nas. */
const LID_OPEN = 112;
const TILT_END = 68;
/**
 * Środek spodu wieczka względem środka pudełka (w jednostkach boku `--w`), policzony
 * dla powyższych kątów: y = −½ + ½·cos(112°), z = 0,14 + ½·sin(112°), obrócone o 68° w osi X.
 */
const FACE_Y = 0.817;
const FACE_Z = 0.411;

/**
 * Pudełko jak „Think inside the box” z referencji. Sekcja trzyma się ekranu, a przewijanie:
 * 1) wynosi zamknięte pudełko pod kątem,
 * 2) otwiera wieczko od frontu,
 * 3) wjeżdża kamerą w spód wieczka, aż ten wypełni cały ekran,
 * 4) hasło wypala się litera po literze bezpośrednio na tekturze wieczka, potem przyciski.
 *
 * Wszystko dzieje się na tym samym trójwymiarowym wieczku — nie ma podmiany na płaską
 * kopię, więc nie widać żadnego przejścia. Treść siedzi w środkowym prostokącie, który
 * po zbliżeniu jest widoczny na ekranie (`--fx`, `--fy` liczone z proporcji okna).
 * Najechanie uchyla wieczko i przechyla pudełko, kliknięcie nim podrzuca.
 */
export function BoxScene() {
  const t = useT();
  const ref = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const p = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.5 });

  const peek = useSpring(0, { stiffness: 220, damping: 16 });
  const tilt = useSpring(0, { stiffness: 120, damping: 18 });
  const hop = useSpring(0, { stiffness: 400, damping: 12 });
  // Skala, przy której spód wieczka przykrywa cały ekran — liczona z rozmiaru okna.
  const cover = useMotionValue(4);

  useEffect(() => {
    let lastW = 0;
    let lastH = 0;
    const measure = () => {
      const w = boxRef.current?.offsetWidth;
      if (!w) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Chowający się pasek adresu / klawiatura zmieniają tylko wysokość — pomijamy to,
      // inaczej zbliżone wieczko skakałoby w trakcie przewijania.
      if (lastW && vw === lastW && Math.abs(vh - lastH) < 160) return;
      lastW = vw;
      lastH = vh;
      const c = (Math.max(vw, vh) * 1.02) / w;
      cover.set(c);
      // Jaka część wieczka zostanie na ekranie po zbliżeniu — w niej układamy hasło.
      stage.current?.style.setProperty("--c", String(c));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [cover]);

  const zoom = useTransform(p, [0.44, 0.72], [0, 1], { clamp: true });
  const lid = useTransform(() => Math.min(LID_OPEN, lerpClamp(p.get(), [0.1, 0.4], [0, LID_OPEN]) + peek.get() * (1 - zoom.get())));
  const rx = useTransform(p, [0, 0.32], [56, TILT_END]);
  const rz = useTransform(p, [0, 0.32, 0.62], [-22, -9, 0]);
  const base = useTransform(p, [0, 0.3], [0.82, 1]);
  const scale = useTransform(() => base.get() + (cover.get() - base.get()) * ease(zoom.get()));
  const ty = useTransform(() => {
    const z = ease(zoom.get());
    return 0.32 * (1 - z) + FACE_Y * scale.get() * z;
  });
  const tz = useTransform(() => FACE_Z * scale.get() * ease(zoom.get()));
  const ry = useTransform(() => tilt.get() * (1 - zoom.get()));

  // scale3d, nie scale: zwykłe scale() nie rusza osi Z i przy zbliżeniu wieczko by się spłaszczało i przechylało.
  const transform = useMotionTemplate`translateY(calc(var(--w) * ${ty} - ${hop}px)) translateZ(calc(var(--w) * ${tz})) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale3d(${scale}, ${scale}, ${scale})`;

  const ring = useTransform(p, [0.04, 0.16], [0, 1]);
  const spin = useTransform(p, [0, 1], [0, 140]);
  // para znika przed zbliżeniem — inaczej przeleciałaby przed wieczkiem
  const steam = useTransform(p, [0.2, 0.38, 0.44, 0.5], [0, 1, 1, 0]);
  const intro = useTransform(p, [0, 0.08], [1, 0]);
  const note = useTransform(p, [0.28, 0.34, 0.42, 0.48], [0, 1, 1, 0]);
  // Gdy wieczko stoi już na wprost i wypełnia ekran, podkładamy jego płaską kopię:
  // ta sama tektura w tym samym miejscu, ale rysowana w pełnej rozdzielczości — bez rozmycia.
  const sheet = useTransform(p, [0.72, 0.75], [0, 1], { clamp: true });
  const engrave = useTransform(p, [0.76, 0.9], [0, 1], { clamp: true });
  const actions = useTransform(p, [0.89, 0.95], [0, 1], { clamp: true });
  const cursor = useTransform(zoom, (z): string => (z < 0.15 ? "pointer" : "default"));

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    tilt.set(((e.clientX - r.left) / r.width - 0.5) * 16);
  };

  if (reduced) return <StaticBox />;

  return (
    <section ref={ref} aria-labelledby="box-title" className="relative h-[360vh]">
      <div ref={stage} className="panel sticky top-0 isolate h-[100svh] overflow-hidden bg-cielo [--c:4] [--h:calc(var(--w)*0.14)] [--w:min(34svh,64vw)] lg:[--w:min(38vh,24rem)]">
        <Liquid layers={[{ color: "#c9f0ff", x: -20, y: -10, size: 70, seed: 21, duration: 20 }, { color: "#7fd6f7", x: 50, y: 45, size: 70, seed: 22, duration: 25 }]} />

        <motion.div style={{ opacity: intro }} className="absolute inset-x-0 top-24 z-10 text-center sm:top-28">
          <HandNote rotate={-4}>{t.box.scroll}</HandNote>
        </motion.div>

        <motion.div style={{ opacity: note }} className="absolute top-[30%] right-[7%] z-10 max-w-[13ch] max-lg:top-[18%] max-lg:right-4">
          <HandNote rotate={6} className="text-notte">
            {t.box.note}
          </HandNote>
        </motion.div>

        <div className="absolute inset-0 flex items-center justify-center [perspective:1400px]" onPointerMove={onMove} onPointerLeave={() => tilt.set(0)}>
          <div ref={boxRef} className="size-(--w) [transform-style:preserve-3d]">
            <PizzaBox
              transform={transform}
              lid={lid}
              ringOpacity={ring}
              spin={spin}
              steam={steam}
              cursor={cursor}
              onPointerEnter={() => zoom.get() < 0.15 && peek.set(22)}
              onPointerLeave={() => peek.set(0)}
              onClick={() => {
                if (zoom.get() > 0.15) return;
                hop.set(60);
                setTimeout(() => hop.set(0), 120);
              }}
            />
          </div>
        </div>

        {/* płaska kopia spodu wieczka: ten sam rozmiar (bok × skala zbliżenia) i środek co w 3D */}
        <motion.div style={{ opacity: sheet }} aria-hidden className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="lid-sheet shrink-0" />
        </motion.div>
        <LidMessage engrave={engrave} actions={actions} sheet={sheet} />
      </div>
    </section>
  );
}

/**
 * Hasło wypalane na płaskiej kopii wieczka. Postęp `--e` (0–1) przychodzi z przewijania,
 * każda litera ma własny próg `--i` — CSS liczy jej krycie i „wciśnięcie” sam,
 * bez osobnej animacji na literę. Warstwa jest płaska, więc tekst i przyciski są ostre.
 */
function LidMessage({ engrave, actions, sheet }: { engrave: MotionValue<number>; actions: MotionValue<number>; sheet: MotionValue<number> }) {
  const t = useT();
  const actionsY = useTransform(actions, [0, 1], [24, 0]);
  const events = useTransform(actions, (v): string => (v > 0.6 ? "auto" : "none"));
  const visibility = useTransform(sheet, (v): string => (v > 0 ? "visible" : "hidden"));
  const lines = [t.box.title1, t.box.title2];
  const total = lines.join("").length;
  const render = (line: string, offset: number) =>
    [...line].map((ch, k) =>
      ch === " " ? (
        " "
      ) : (
        <span key={k} className="engrave-char" style={{ "--i": ((offset + k) / total) * 0.94 } as CSSProperties}>
          {ch}
        </span>
      ),
    );

  return (
    <motion.div
      style={{ "--e": engrave, visibility } as unknown as CSSProperties}
      className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center px-6 text-center"
    >
      <h2 id="box-title" aria-label={`${t.box.title1} ${t.box.title2}`} className="engraved text-[clamp(2.7rem,11vw,8.5rem)] leading-[0.95] font-extrabold tracking-tight">
        <span aria-hidden className="block whitespace-nowrap">
          {render(lines[0], 0)}
        </span>
        <span aria-hidden className="engraved-deep block whitespace-nowrap">
          {render(lines[1], lines[0].length)}
        </span>
      </h2>

      <motion.div style={{ opacity: actions, y: actionsY, pointerEvents: events }} className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:mt-10">
        <a href="#menu" className="btn-3d flex h-16 items-center gap-3 rounded-2xl bg-ink pr-6 pl-3 text-left text-paper">
          <PizzaArt {...ART.margherita} className="size-10" />
          <span>
            <span className="block text-xs font-semibold opacity-80">{t.box.orderSub}</span>
            <span className="block text-xl leading-none font-extrabold">{t.box.order}</span>
          </span>
        </a>
        <a href={RESTAURANT.phoneHref} className="btn-3d flex h-16 items-center gap-3 rounded-2xl bg-ink pr-6 pl-4 text-left text-paper">
          <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z" />
          </svg>
          <span>
            <span className="block text-xs font-semibold opacity-80">{t.box.callSub}</span>
            <span className="block text-xl leading-none font-extrabold">{t.box.call}</span>
          </span>
        </a>
      </motion.div>
      <motion.p style={{ opacity: actions }} className="engraved font-hand mt-6 -rotate-3 text-2xl sm:text-3xl">
        {t.box.handmade}
      </motion.p>
    </motion.div>
  );
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Interpolacja liniowa z przycięciem — zwykła funkcja, używana w środku `useTransform(() => …)`. */
function lerpClamp(v: number, [a, b]: [number, number], [from, to]: [number, number]) {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return from + (to - from) * t;
}

function StaticBox() {
  const t = useT();
  return (
    <section aria-labelledby="box-title" className="kraft panel relative overflow-hidden py-(--spacing-section)">
      
      <div className="container-page relative text-center">
        <h2 id="box-title" className="engraved text-[clamp(3rem,10vw,8.5rem)] leading-[0.95] font-extrabold tracking-tight">
          {t.box.title1}
          <br />
          <span className="engraved-deep">{t.box.title2}</span>
        </h2>
        <a href="#menu" className="btn-3d mt-10 inline-flex h-14 items-center rounded-full bg-ink px-6 font-extrabold text-paper">
          {t.box.order}
        </a>
      </div>
    </section>
  );
}
