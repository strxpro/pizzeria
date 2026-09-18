"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { INGREDIENTS } from "@/lib/data";
import { useT } from "@/lib/i18n/provider";
import { useMedia } from "@/lib/use-media";
import { HandNote } from "./kit";
import { Liquid } from "./liquid";
import { ART, PizzaArt } from "./pizza-art";

/**
 * Ogromna lista składników jak lista gatunków w referencji.
 *
 * Aktywny składnik zmienia krój na odręczny, a obok wyskakują pizze, w których
 * występuje, i naklejka z pochodzeniem. Na komputerze aktywny jest ten pod
 * kursorem, na telefonie — ten, który przewija się przez środek ekranu.
 */
export function Ingredients() {
  const t = useT();
  const reduced = useReducedMotion();
  const fine = useMedia("(hover: hover) and (pointer: fine)");
  const [active, setActive] = useState<number | null>(null);
  const [anchor, setAnchor] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const items = useRef<(HTMLLIElement | null)[]>([]);

  const activate = (i: number | null) => {
    setActive(i);
    const el = i === null ? null : items.current[i];
    if (el) setAnchor(el.offsetTop + el.offsetHeight / 2);
  };

  // Telefon: aktywny składnik = ten na środku ekranu.
  useEffect(() => {
    if (fine) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          setActive(Number(el.dataset.index));
          setAnchor(el.offsetTop + el.offsetHeight / 2);
        }
      },
      { rootMargin: "-46% 0px -46% 0px" },
    );
    items.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [fine]);

  const current = active === null ? null : INGREDIENTS[active];

  return (
    <section aria-labelledby="ingredienti-title" className="panel relative isolate overflow-hidden bg-pomodoro py-(--spacing-section)">
      <Liquid layers={[{ color: "#ff7a52", x: -25, y: 10, size: 70, seed: 31, duration: 21 }, { color: "#f0482a", x: 55, y: 50, size: 60, seed: 32, duration: 17 }]} />

      <div className="container-page relative text-center">
        <h2 id="ingredienti-title" className="text-xl font-extrabold">
          {t.ingredients.title}
        </h2>
        <HandNote rotate={-8} className="mx-auto mt-2 w-[18ch] lg:absolute lg:top-0 lg:left-[6%] lg:mt-0">
          {t.ingredients.note}
        </HandNote>

        <ul ref={list} className="relative mt-8 lg:mt-12" onMouseLeave={() => fine && activate(null)}>
          {/* wyskakujące pizze i naklejka — pod tekstem, jak okładki w referencji */}
          <AnimatePresence>
            {current ? (
              <motion.div
                key={current.name}
                aria-hidden
                className="pointer-events-none absolute inset-x-0 z-0"
                style={{ top: anchor }}
                initial="hidden"
                animate="show"
                exit="hidden"
              >
                <Pop className="-top-[clamp(3.5rem,14vw,11rem)] left-[-10%] w-[clamp(4.5rem,18vw,15rem)] sm:left-[2%]" rotate={-14}>
                  <PizzaArt {...ART[current.pizzas[0]]} className="w-full drop-shadow-[0_20px_20px_rgb(60_10_0/0.35)]" />
                </Pop>
                <Pop className="top-[clamp(0.5rem,3vw,3rem)] right-[-10%] w-[clamp(4.5rem,20vw,17rem)] sm:right-[2%]" rotate={12} delay={0.05}>
                  <PizzaArt {...ART[current.pizzas[1]]} className="w-full drop-shadow-[0_20px_20px_rgb(60_10_0/0.35)]" />
                </Pop>
                <Pop className="-top-[clamp(4rem,9vw,7rem)] right-[4%] max-sm:hidden sm:right-[16%]" rotate={-6} delay={0.1}>
                  <span className="font-hand block rounded-2xl border-[2.5px] border-ink bg-giallo px-3 py-1 text-xl whitespace-nowrap sm:text-2xl">
                    {t.ingredients.from(current.origin)}
                  </span>
                </Pop>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {INGREDIENTS.map((ing, i) => {
            const isActive = active === i;
            const dim = active !== null && !isActive;
            return (
              <motion.li
                key={ing.name}
                ref={(el) => {
                  items.current[i] = el;
                }}
                data-index={i}
                initial={reduced ? false : { opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "0px 0px 12% 0px" }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.02 * i }}
                // telefon: krótsza lista, żeby sekcja nie ciągnęła się bez końca
                className={`relative z-10 ${i >= 6 ? "max-sm:hidden" : ""}`}
              >
                <span
                  onMouseEnter={() => fine && activate(i)}
                  className={`relative inline-block cursor-default py-[0.03em] text-[clamp(1.9rem,7.4vw,7rem)] leading-[0.92] font-extrabold tracking-[-0.035em] transition-opacity duration-500 ${
                    dim ? "opacity-35" : ""
                  }`}
                >
                  {/* dwie warstwy o tej samej wysokości wiersza — zmiana kroju nie przesuwa listy */}
                  <span className={`block transition-[opacity,scale] duration-300 ${isActive ? "scale-90 opacity-0" : ""}`}>{ing.name}</span>
                  <span
                    aria-hidden
                    className={`font-hand absolute inset-0 flex items-center justify-center whitespace-nowrap text-paper transition-[opacity,scale,rotate] duration-300 ease-(--ease-out) ${
                      isActive ? "-rotate-3 scale-105 opacity-100" : "scale-75 opacity-0"
                    }`}
                  >
                    {ing.name}
                  </span>
                  <span className="sr-only">, {t.ingredients.from(ing.origin)}</span>
                </span>
                {/* telefon: pochodzenie pod aktywnym słowem, w zarezerwowanym miejscu — nic nie nachodzi na tekst */}
                <span
                  aria-hidden
                  className={`font-hand block h-7 text-lg leading-7 text-paper transition-[opacity,translate] duration-500 sm:hidden ${isActive ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"}`}
                >
                  {t.ingredients.from(ing.origin)}
                </span>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function Pop({ children, className, rotate, delay = 0 }: { children: ReactNode; className: string; rotate: number; delay?: number }) {
  return (
    <motion.div
      className={`absolute ${className}`}
      variants={{
        hidden: { scale: 0, rotate: rotate * 3, opacity: 0 },
        show: { scale: 1, rotate, opacity: 1, transition: { type: "spring", stiffness: 380, damping: 20, delay } },
      }}
      transition={{ duration: 0.18 }}
    >
      {children}
    </motion.div>
  );
}
