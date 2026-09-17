"use client";

import { AnimatePresence, motion, useMotionValue, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { RESTAURANT } from "@/lib/data";
import { useT } from "@/lib/i18n/provider";
import { cheeseGo, MeltEdge } from "./cheese";
import { ItemIcon, type IconName } from "./ingredient-icons";
import { OpenStatus } from "./open-status";
import { ART, PizzaArt } from "./pizza-art";

type NavKey = "menu" | "how" | "delivery" | "reviews" | "faq";

/** Kolorowe pasy nad krawędzią zasłony — widać je, gdy zasłona zjeżdża i odjeżdża. */
const ACCENTS = [
  { bg: "bg-giallo", text: "text-giallo" },
  { bg: "bg-pomodoro", text: "text-pomodoro" },
] as const;

/** Karta każdej sekcji: kolor, ikona i lekkie przechylenie. */
const CARDS: Record<NavKey, { tone: string; icon: IconName; tilt: number }> = {
  menu: { tone: "bg-giallo", icon: "margherita", tilt: -1.5 },
  how: { tone: "bg-pomodoro", icon: "diavola", tilt: 1.2 },
  delivery: { tone: "bg-cielo", icon: "funghi", tilt: -1 },
  reviews: { tone: "bg-menta", icon: "tiramisu", tilt: 1.5 },
  faq: { tone: "bg-rosa", icon: "cannolo", tilt: -1.2 },
};

const OUT = [0.76, 0, 0.24, 1] as const;
const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Menu na telefonie: jedna zasłona zjeżdża z góry — granatowa, z żółtym i czerwonym pasem
 * i kapiącym serem na dolnej krawędzi — a za nią spokojnie wchodzą kolorowe karty sekcji.
 * Zamyka się jednym ruchem w górę (bez rozjeżdżania warstw), pokrywa cały ekran.
 * W tle powoli kręci się pizza. Same transformacje i przezroczystość.
 */
export function MobileMenu({
  open,
  nav,
  current,
  onClose,
}: {
  open: boolean;
  nav: readonly (readonly [string, NavKey])[];
  current: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const reduced = useReducedMotion();
  const stretch = useMotionValue(0.9);
  // Ciężkie ozdobniki (pizza z gradientami) montujemy dopiero po wjeździe zasłony — kliknięcie nie szarpie.
  const [settled, setSettled] = useState(false);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          id="menu-mobile"
          className="fixed inset-0 z-[45] lg:hidden"
          initial={reduced ? { opacity: 0 } : { y: "-100%" }}
          animate={reduced ? { opacity: 1 } : { y: "0%" }}
          exit={reduced ? { opacity: 0 } : { y: "-110%", transition: { duration: 0.42, ease: OUT } }}
          transition={{ duration: 0.55, ease: OUT }}
          onAnimationStart={() => setSettled(false)}
          onAnimationComplete={() => setSettled(true)}
          style={{ willChange: "transform" }}
        >
          {ACCENTS.map((a, i) => (
            <div
              key={a.bg}
              aria-hidden
              className={`absolute inset-x-0 top-0 h-[calc(100%+var(--lift))] ${a.bg} ${a.text}`}
              style={{ "--lift": `${(ACCENTS.length - i) * 26}px` } as CSSProperties}
            />
          ))}
          <div aria-hidden className="absolute inset-0 bg-notte text-notte">
            <div className="absolute inset-x-0 top-full -mt-px">
              <MeltEdge stretch={stretch} />
            </div>
          </div>

          <div data-lenis-prevent className="relative flex h-full flex-col overflow-x-hidden overflow-y-auto overscroll-contain pt-24 pb-8 text-paper">
            {/* pizza kręcąca się w tle — dopiero, gdy zasłona stanie */}
            {settled ? (
              <motion.div
                aria-hidden
                className="pointer-events-none absolute -right-[28vw] -bottom-[18vw] w-[82vw]"
                initial={reduced ? false : { scale: 0.7, rotate: -40, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 0.9 }}
                transition={{ type: "spring", stiffness: 80, damping: 20 }}
              >
                <PizzaArt {...ART.diavola} className="w-full animate-spin-slow" />
              </motion.div>
            ) : null}

            <nav aria-label={t.nav.main} className="container-page relative">
              <motion.p
                className="font-hand mb-3 -rotate-3 text-2xl text-giallo"
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: EASE, delay: 0.3 }}
              >
                {t.nav.hungry}
              </motion.p>
              <ul className="grid gap-3">
                {nav.map(([href, key], i) => {
                  const card = CARDS[key];
                  return (
                    <motion.li
                      key={href}
                      initial={reduced ? false : { opacity: 0, y: 26, rotate: card.tilt * 2.5 }}
                      animate={{ opacity: 1, y: 0, rotate: card.tilt }}
                      transition={{ type: "spring", stiffness: 210, damping: 24, delay: 0.28 + i * 0.05 }}
                    >
                      <motion.a
                        href={href}
                        data-cheese
                        whileTap={{ scale: 0.97, rotate: 0 }}
                        onClick={(e) => {
                          e.preventDefault();
                          onClose();
                          cheeseGo(href, t.nav[key]);
                        }}
                        className={`flex items-center gap-3 rounded-[1.4rem] border-[2.5px] border-ink py-2.5 pr-3 pl-3 text-ink shadow-[0_5px_0_var(--color-ink)] select-none ${card.tone}`}
                      >
                        <span className="flex size-12 shrink-0 items-center justify-center rounded-full border-[2.5px] border-ink bg-paper">
                          <ItemIcon name={card.icon} className="size-8" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="tabular block text-xs font-bold opacity-60">{String(i + 1).padStart(2, "0")}</span>
                          <span className="block truncate text-[1.7rem] leading-none font-extrabold tracking-tight">{t.nav[key]}</span>
                        </span>
                        {current === href ? <span className="size-3 shrink-0 animate-pulse rounded-full border-2 border-ink bg-paper" aria-hidden /> : null}
                        <svg viewBox="0 0 24 24" className="size-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                      </motion.a>
                    </motion.li>
                  );
                })}
              </ul>
            </nav>

            <motion.div
              className="container-page relative mt-auto grid gap-3 pt-8"
              initial={reduced ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: EASE, delay: 0.5 }}
            >
              <div className="grid grid-cols-2 gap-3">
                <Link href="/i-miei-ordini" onClick={onClose} className="btn-3d flex h-14 items-center justify-center rounded-2xl bg-giallo px-2 text-[0.95rem] font-extrabold whitespace-nowrap text-ink">
                  {t.nav.myOrders}
                </Link>
                <a href={RESTAURANT.phoneHref} className="btn-3d flex h-14 items-center justify-center rounded-2xl bg-paper px-2 text-[0.95rem] font-extrabold text-ink">
                  {t.common.call}
                </a>
              </div>
              <OpenStatus className="justify-self-start text-ink" />
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
