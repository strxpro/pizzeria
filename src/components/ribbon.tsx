"use client";

import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from "motion/react";
import { useEffect, useRef, type RefObject } from "react";
import { useT } from "@/lib/i18n/provider";

/**
 * Dwie skrzyżowane wstęgi, które jadą razem z przewijaniem.
 *
 * - kierunek idzie za kierunkiem przewijania, ale zmienia się płynnie:
 *   wstęga zwalnia, zatrzymuje się i dopiero rusza w drugą stronę;
 * - szybsze przewijanie = szybsza wstęga;
 * - gdy wstęgi są na środku ekranu, zwalniają, żeby dało się przeczytać.
 */
export function Ribbon() {
  const ref = useRef<HTMLElement>(null);
  const t = useT();

  return (
    <section ref={ref} aria-label={t.perks.join(", ")} className="relative z-10 overflow-x-clip py-20 sm:py-28">
      <ul className="sr-only">
        {t.perks.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <Band anchor={ref} className="rotate-[4deg] bg-giallo" direction={1} />
      <Band anchor={ref} className="absolute inset-x-0 top-1/2 -translate-y-1/2 -rotate-[3deg] bg-cielo" direction={-1} />
    </section>
  );
}

const wrap = (min: number, max: number, v: number) => {
  const range = max - min;
  return ((((v - min) % range) + range) % range) + min;
};

function Band({ className, direction, anchor }: { className: string; direction: 1 | -1; anchor: RefObject<HTMLElement | null> }) {
  const perks = useT().perks;
  const reduced = useReducedMotion();
  const offset = useMotionValue(0);
  const { scrollY } = useScroll();
  const velocity = useSpring(useVelocity(scrollY), { damping: 50, stiffness: 300 });
  const x = useTransform(offset, (v) => `${wrap(-50, 0, v)}%`);

  const heading = useRef(1); // ostatni kierunek przewijania
  const speed = useRef(0); // bieżąca prędkość w %/s, dochodzi do celu miękko

  // Poza ekranem nic nie liczymy.
  const visible = useRef(false);
  // Pozycja wstęgi na stronie — mierzona tylko przy zmianie rozmiaru, nie w każdej klatce
  // (odczyt układu w pętli animacji wymuszał przeliczenie strony i dawał mikro-przycięcia).
  const box = useRef({ top: 0, height: 0 });
  useEffect(() => {
    const el = anchor.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      box.current = { top: r.top + window.scrollY, height: r.height };
    };
    measure();
    const io = new IntersectionObserver(
      ([e]) => {
        visible.current = e.isIntersecting;
        if (e.isIntersecting) measure();
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    return () => {
      io.disconnect();
      ro.disconnect();
    };
  }, [anchor]);

  useAnimationFrame((_, delta) => {
    if (reduced || !visible.current) return;
    const dt = Math.min(delta, 64) / 1000;
    const v = velocity.get();
    if (Math.abs(v) > 20) heading.current = Math.sign(v);

    // Zwolnienie na środku ekranu: 0 = idealnie na środku, 1 = przy krawędzi.
    const mid = window.innerHeight / 2;
    const center = Math.min(1, Math.abs(box.current.top + box.current.height / 2 - scrollY.get() - mid) / mid);

    const base = 2.2 * (0.3 + 0.7 * center);
    const boost = Math.min(Math.abs(v) / 400, 6);
    const target = direction * heading.current * (base + boost);

    // Miękkie dojście do celu — przy zmianie kierunku prędkość przechodzi przez zero.
    speed.current += (target - speed.current) * Math.min(1, dt * 2.4);
    offset.set(offset.get() - speed.current * dt);
  });

  const run = [...perks, ...perks];
  return (
    <div aria-hidden className={`-mx-[5vw] overflow-hidden border-y-[3px] border-ink py-3 sm:py-4 ${className}`}>
      <motion.div className="flex w-max" style={{ x }}>
        {[0, 1].map((half) => (
          <div key={half} className="flex shrink-0">
            {run.map((perk, i) => (
              <span key={`${half}-${i}`} className="flex items-center text-[clamp(1.5rem,3.4vw,3rem)] leading-none font-extrabold tracking-tight whitespace-nowrap">
                <span className="px-6">{perk}</span>
                <Star />
              </span>
            ))}
          </div>
        ))}
      </motion.div>
    </div>
  );
}

function Star() {
  return (
    <svg viewBox="0 0 40 40" className="size-[0.8em] shrink-0" aria-hidden>
      <path d="M20 0l4.6 13.2L38 8.4l-8.6 11.6L40 28.6l-14-1.2L20 40l-6-12.6-14 1.2 10.6-8.6L2 8.4l13.4 4.8z" fill="currentColor" />
    </svg>
  );
}
