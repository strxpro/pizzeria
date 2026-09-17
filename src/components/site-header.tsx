"use client";

import { motion, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { RESTAURANT } from "@/lib/data";
import { useT } from "@/lib/i18n/provider";
import { cheeseGo } from "./cheese";
import { PhoneIcon } from "./hero";
import { LangSwitch } from "./lang-switch";
import { Mark } from "./preloader";
import { MobileMenu } from "./mobile-menu";
import { lockScroll } from "./smooth-scroll";

const NAV = [
  ["#menu", "menu"],
  ["#come-funziona", "how"],
  ["#consegna", "delivery"],
  ["#recensioni", "reviews"],
  ["#faq", "faq"],
] as const;

export function ReceiptIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 2.5h12v19l-3-2-3 2-3-2-3 2Z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  );
}

/**
 * Nagłówek jak w referencji: znak po lewej, kapsuła z sekcjami pośrodku, po prawej
 * język, „Moje zamówienia” i telefon. Chowa się przy przewijaniu w dół.
 * Na telefonie kapsułę zastępuje pełnoekranowe menu z ogromnymi linkami.
 */
export function SiteHeader() {
  const t = useT();
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);

  // Podświetlenie sekcji, która jest teraz na środku ekranu.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setCurrent(`#${e.target.id}`);
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    NAV.forEach(([href]) => {
      const el = document.querySelector(href);
      if (el) io.observe(el);
    });
    const top = document.querySelector("#top");
    const clear = new IntersectionObserver(([e]) => e.isIntersecting && setCurrent(null), { rootMargin: "0px 0px -60% 0px" });
    if (top) clear.observe(top);
    return () => {
      io.disconnect();
      clear.disconnect();
    };
  }, []);

  // Punkt ostatniej zmiany kierunku: nagłówek reaguje dopiero po kilkunastu pikselach ruchu
  // w jedną stronę — drgnięcia palca i odbicie na końcu strony go nie szarpią.
  const turn = useRef({ at: 0, dir: 0 });
  useMotionValueEvent(scrollY, "change", (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    if (y <= 240) return setHidden(false);
    if (y === prev) return;
    const dir = y > prev ? 1 : -1;
    if (dir !== turn.current.dir) turn.current = { at: prev, dir };
    if (dir === 1 && y - turn.current.at > 16) setHidden(true);
    if (dir === -1 && turn.current.at - y > 16) setHidden(false);
  });

  useEffect(() => () => lockScroll(false, "menu"), []);

  useEffect(() => {
    // menu zakrywa cały ekran i ma własne przewijanie — wystarczy zatrzymać Lenis
    lockScroll(menuOpen, "menu", { hideOverflow: false });
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <>
      <motion.header
        className="fixed inset-x-0 top-0 z-50"
        animate={{ y: hidden && !menuOpen ? "-110%" : "0%" }}
        transition={reduced ? { duration: 0 } : { duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="container-page flex h-20 items-center gap-2">
          <a href="#top" className="btn-3d btn-3d-sm flex h-11 items-center gap-2 rounded-full bg-paper pr-1 pl-1 sm:pr-4" aria-label={`${RESTAURANT.name}, ${t.nav.home}`}>
            <Mark className="size-8 text-ink" />
            <span className="hidden text-lg leading-none font-extrabold tracking-tight sm:block">{RESTAURANT.name}</span>
          </a>

          {/* jedna kapsuła zamiast luźnych pigułek — czytelna na każdym tle */}
          <nav
            aria-label={t.nav.main}
            className="absolute left-1/2 hidden -translate-x-1/2 rounded-full border-[2.5px] border-ink bg-paper p-1 shadow-[0_3px_0_var(--color-ink)] lg:block"
          >
            <ul className="flex items-center">
              {NAV.map(([href, key]) => (
                <li key={href} className="relative">
                  {current === href ? (
                    <motion.span
                      layoutId="nav-current"
                      className="absolute inset-0 rounded-full bg-ink"
                      transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }}
                    />
                  ) : null}
                  <a
                    href={href}
                    data-cheese
                    aria-current={current === href ? "location" : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      cheeseGo(href, t.nav[key]);
                    }}
                    className={`relative inline-flex h-9 items-center rounded-full px-3.5 text-sm font-bold whitespace-nowrap transition-colors duration-200 xl:px-4 ${
                      current === href ? "text-paper" : "hover:bg-giallo"
                    }`}
                  >
                    {t.nav[key]}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <LangSwitch />
            <Link
              href="/i-miei-ordini"
              aria-label={t.nav.myOrders}
              className="btn-3d btn-3d-sm hidden h-11 items-center gap-2 rounded-full bg-giallo px-3 text-sm font-extrabold sm:inline-flex 2xl:px-4"
            >
              <ReceiptIcon />
              <span className="hidden 2xl:inline">{t.nav.myOrders}</span>
            </Link>
            <a
              href={RESTAURANT.phoneHref}
              aria-label={`${t.common.call} ${RESTAURANT.phone}`}
              className="btn-3d btn-3d-sm hidden h-11 items-center gap-2 rounded-full bg-ink px-4 text-sm font-bold text-paper lg:inline-flex"
            >
              <PhoneIcon className="size-4" />
              <span className="hidden 2xl:inline">{RESTAURANT.phone}</span>
            </a>

            <button
              type="button"
              aria-expanded={menuOpen}
              aria-controls="menu-mobile"
              onClick={() => setMenuOpen((o) => !o)}
              className={`relative inline-flex size-11 items-center justify-center rounded-full border-[2.5px] border-ink transition-[background-color,rotate] duration-500 ease-(--ease-out) lg:hidden ${menuOpen ? "rotate-90 bg-giallo text-ink" : "bg-paper text-ink"}`}
            >
              <span className="sr-only">{menuOpen ? t.nav.closeMenu : t.nav.openMenu}</span>
              {/* dwie kreski różnej długości składają się w krzyżyk */}
              <span aria-hidden className={`absolute h-[2.5px] rounded-full bg-current transition-all duration-300 ease-(--ease-out) ${menuOpen ? "w-5 rotate-45" : "w-5 -translate-y-[4px]"}`} />
              <span aria-hidden className={`absolute h-[2.5px] rounded-full bg-current transition-all duration-300 ease-(--ease-out) ${menuOpen ? "w-5 -rotate-45" : "w-3 translate-x-[4px] translate-y-[4px]"}`} />
            </button>
          </div>
        </div>
      </motion.header>

      <MobileMenu open={menuOpen} nav={NAV} current={current} onClose={() => setMenuOpen(false)} />
    </>
  );
}
