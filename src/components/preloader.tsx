"use client";

import { animate, AnimatePresence, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/provider";
import { finishIntro } from "@/lib/intro";
import { MeltEdge } from "./cheese";
import { lockScroll } from "./smooth-scroll";

const r2 = (n: number) => Math.round(n * 100) / 100;
const ring = (n: number, radius: number, offset: number) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + offset;
    return { x: r2(100 + Math.cos(a) * radius), y: r2(100 + Math.sin(a) * radius) };
  });

/** Dodatki rozłożone deterministycznie — serwer i przeglądarka rysują to samo. */
const CHEESE = [...ring(5, 48, 0.3), ...ring(3, 20, 1.2), { x: 100, y: 100 }];
const BASIL = ring(5, 36, 0.9);
const CHAR = ring(12, 86, 0.2);

/** Progi licznika, przy których pizza dostaje kolejną warstwę. */
const STAGE_AT = [0, 20, 40, 60, 80];

const pop = { type: "spring", stiffness: 420, damping: 18 } as const;

/**
 * Preloader: serowo-żółta plansza, na środku pizza składana warstwa po warstwie
 * (ciasto, sos, mozzarella, bazylia, piec), pod nią podpis etapu i cienki pasek postępu.
 * Postęp idzie za prawdziwym ładowaniem: fonty, `load`, ustabilizowanie hydratacji
 * i rozgrzanie układu wszystkich sekcji. Na końcu plansza odjeżdża w górę, ciągnąc ser.
 *
 * - `prefers-reduced-motion` pomija go całkowicie;
 * - przy kolejnej wizycie w tej samej karcie pokazuje się krócej;
 * - bezpiecznik zdejmuje zasłonę po kilku sekundach, gdyby coś się zawiesiło.
 */
export function Preloader() {
  const t = useT();
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<"loading" | "leaving" | "done">("loading");
  const [stage, setStage] = useState(0);
  const count = useMotionValue(0);
  const label = useTransform(count, (v) => `${Math.round(v)}%`);
  const bar = useTransform(count, (v) => v / 100);
  const lift = useMotionValue(0);
  const y = useTransform(lift, (v) => `${-v * 135}%`);
  const stretch = useTransform(lift, [0, 0.5, 1], [0.4, 1.8, 1.2]);

  useMotionValueEvent(count, "change", (v) => {
    const next = v >= 99.5 ? 5 : STAGE_AT.filter((at) => v >= at).length - 1;
    setStage((s) => (s === next ? s : next));
  });

  // Dopóki plansza zasłania stronę, przewijanie stoi — po odjeździe wraca.
  useEffect(() => {
    if (reduced) return;
    lockScroll(phase !== "done", "preloader");
    return () => lockScroll(false, "preloader");
  }, [phase, reduced]);

  useEffect(() => {
    if (reduced) {
      finishIntro();
      return;
    }
    let cancelled = false;
    let repeat = false;
    try {
      repeat = sessionStorage.getItem("pz-intro") === "1";
      sessionStorage.setItem("pz-intro", "1");
    } catch {
      /* brak dostępu do pamięci — pokazujemy pełną wersję */
    }

    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const idle = () =>
      new Promise<void>((resolve) => {
        if ("requestIdleCallback" in window) window.requestIdleCallback(() => resolve(), { timeout: 600 });
        else setTimeout(resolve, 120);
      });

    const tasks: Promise<unknown>[] = [
      document.fonts?.ready ?? Promise.resolve(),
      new Promise<void>((resolve) => {
        if (document.readyState === "complete") resolve();
        else window.addEventListener("load", () => resolve(), { once: true });
      }),
      // dwie klatki: wszystkie efekty po hydratacji zdążyły się podpiąć
      frame().then(frame),
      // rozgrzanie: styl i układ każdej sekcji policzone, zanim ktokolwiek przewinie
      idle().then(() => {
        document.querySelectorAll("main section, footer").forEach((el) => el.getBoundingClientRect());
      }),
      new Promise((resolve) => setTimeout(resolve, repeat ? 500 : 1500)),
    ];

    let settled = 0;
    let run = animate(count, 8, { duration: 0.4, ease: "easeOut" });
    for (const task of tasks) {
      task.then(() => {
        if (cancelled) return;
        settled += 1;
        run.stop();
        run = animate(count, 8 + (88 * settled) / tasks.length, { duration: 0.55, ease: [0.3, 0, 0.2, 1] });
      });
    }

    (async () => {
      await Promise.all(tasks);
      if (cancelled) return;
      run.stop();
      await animate(count, 100, { duration: 0.35, ease: "easeOut" });
      await new Promise((resolve) => setTimeout(resolve, repeat ? 150 : 380));
      if (cancelled) return;
      setPhase("leaving");
      finishIntro();
      await animate(lift, 1, { duration: 1, ease: [0.76, 0, 0.24, 1] });
      if (!cancelled) setPhase("done");
    })();

    const safety = setTimeout(() => {
      finishIntro();
      setPhase("done");
    }, 7000);

    return () => {
      cancelled = true;
      run.stop();
      clearTimeout(safety);
    };
  }, [reduced, count, lift]);

  if (reduced || phase === "done") return null;

  const caption = stage >= 5 ? t.preloader.ready : t.preloader.stages[stage];
  const leaving = phase === "leaving";

  return (
    <motion.div
      aria-hidden
      data-no-scramble
      style={{ y }}
      className="preloader-failsafe fixed inset-0 z-[100] bg-giallo text-giallo will-change-transform"
    >
      {/* miękkie światło na środku — brzegi zostają czysto żółte, żeby ser na dole się zlewał */}
      <div className="absolute inset-0 bg-[radial-gradient(70%_55%_at_50%_42%,#ffe07a_0%,transparent_100%)]" />

      <div className="relative flex h-full flex-col items-center justify-center px-6 text-ink">
        <motion.div
          animate={leaving ? { scale: 0.8, opacity: 0, y: -30 } : { scale: 1, opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.76, 0, 0.24, 1] }}
          className="flex flex-col items-center"
        >
          <div className="relative size-[min(52vw,15rem)]">
            {/* cień pod pizzą: gradient zamiast rozmycia */}
            <motion.div
              className="absolute -bottom-[14%] left-[8%] h-[22%] w-[84%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(150_85_0/0.32),transparent)]"
              animate={{ scaleX: [1, 0.9, 1], opacity: [1, 0.75, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute inset-0"
              animate={{ y: [0, -8, 0], rotate: stage * 18 }}
              transition={{ y: { duration: 2.4, repeat: Infinity, ease: "easeInOut" }, rotate: { type: "spring", stiffness: 90, damping: 16 } }}
            >
              <BuildPizza stage={stage} />
            </motion.div>
          </div>

          <div className="relative mt-10 h-9 w-[80vw] max-w-sm overflow-hidden text-center">
            <AnimatePresence initial={false}>
              <motion.p
                key={caption}
                initial={{ y: 28, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -28, opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="font-hand absolute inset-x-0 text-[1.7rem] leading-9"
              >
                {caption}
              </motion.p>
            </AnimatePresence>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <div className="h-1.5 w-[min(46vw,11rem)] overflow-hidden rounded-full bg-[rgb(150_85_0/0.18)]">
              <motion.div style={{ scaleX: bar }} className="h-full origin-left rounded-full bg-ink" />
            </div>
            <motion.span className="tabular w-10 text-sm font-extrabold">{label}</motion.span>
          </div>
        </motion.div>
      </div>

      <div className="absolute inset-x-0 top-full -mt-px">
        <MeltEdge stretch={stretch} />
      </div>
    </motion.div>
  );
}

const ORIGIN = { transformBox: "fill-box", transformOrigin: "center" } as const;
const LAYER = { off: { scale: 0, opacity: 0 }, on: { scale: 1, opacity: 1 } };

/** Pizza, która dostaje kolejne warstwy — same skale i przezroczystości, cienie jako płaskie kształty. */
function BuildPizza({ stage }: { stage: number }) {
  const at = (from: number) => (stage >= from ? "on" : "off");
  const stagger = (from: number, i: number, step: number) => ({ ...pop, delay: stage === from ? i * step : 0 });

  return (
    <svg viewBox="0 0 200 200" className="size-full overflow-visible">
      {/* ciasto z brzegiem: jaśniejszy środek, ciemniejszy rant i odblask */}
      <motion.g initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={pop} style={ORIGIN}>
        <circle cx="100" cy="100" r="94" fill="#e3ad5f" />
        <circle cx="100" cy="100" r="94" fill="none" stroke="#c98d3f" strokeWidth="4" />
        <path d="M30 70 A76 76 0 0 1 90 22" fill="none" stroke="#f6d49a" strokeWidth="6" strokeLinecap="round" />
        <circle cx="100" cy="100" r="80" fill="#f1cf94" />
      </motion.g>

      {/* sos z ciemniejszą obwódką */}
      <motion.g style={ORIGIN} variants={LAYER} initial="off" animate={at(1)} transition={pop}>
        <circle cx="100" cy="100" r="76" fill="#e8452c" />
        <circle cx="100" cy="100" r="74" fill="none" stroke="#c7321d" strokeWidth="4" opacity="0.6" />
      </motion.g>

      {/* mozzarella: każdy płat z cieniem pod spodem */}
      {CHEESE.map((c, i) => (
        <motion.g key={i} style={ORIGIN} variants={LAYER} initial="off" animate={at(2)} transition={stagger(2, i, 0.04)}>
          <ellipse cx={c.x + 1.5} cy={c.y + 3} rx="15" ry="12" fill="#b8321d" opacity="0.45" />
          <ellipse cx={c.x} cy={c.y} rx="15" ry="12" fill="#fff4dc" />
          <ellipse cx={c.x - 4} cy={c.y - 4} rx="5" ry="3" fill="#fff" opacity="0.8" />
        </motion.g>
      ))}

      {/* bazylia */}
      {BASIL.map((b, i) => (
        <motion.path
          key={i}
          d={`M${r2(b.x - 9)} ${b.y} Q${b.x} ${r2(b.y - 9)} ${r2(b.x + 9)} ${b.y} Q${b.x} ${r2(b.y + 9)} ${r2(b.x - 9)} ${b.y}Z`}
          fill="#2f9e44"
          stroke="#237a33"
          strokeWidth="1.5"
          style={ORIGIN}
          variants={{ off: { scale: 0, rotate: -90, opacity: 0 }, on: { scale: 1, rotate: i * 37, opacity: 1 } }}
          initial="off"
          animate={at(3)}
          transition={stagger(3, i, 0.05)}
        />
      ))}

      {/* piec: cętki na brzegu */}
      {CHAR.map((c, i) => (
        <motion.circle key={i} cx={c.x} cy={c.y} r={i % 3 ? 3 : 4.5} fill="#7a4418" style={ORIGIN} variants={LAYER} initial="off" animate={at(4)} transition={stagger(4, i, 0.03)} />
      ))}
    </svg>
  );
}

/** Znak marki: kawałek pizzy w okręgu, z dziurami na dodatki. Kolor z `currentColor`. */
export function Mark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="5" />
      <path
        fillRule="evenodd"
        fill="currentColor"
        d="M50 22 L74 68 Q50 80 26 68 Z M50 44 a4.5 4.5 0 1 0 0.01 0 Z M41 59 a3.5 3.5 0 1 0 0.01 0 Z M59 59 a3.5 3.5 0 1 0 0.01 0 Z"
      />
    </svg>
  );
}
