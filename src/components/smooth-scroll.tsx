"use client";

import Lenis from "lenis";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Płynne przewijanie (Lenis) — ten sam mechanizm, którego używa referencja.
 *
 * - niskie `lerp`: strona dojeżdża długo i miękko, zamiast stanąć od razu;
 * - `prefers-reduced-motion` wyłącza interpolację całkowicie;
 * - kotwice obsługujemy sami, bo Lenis nadpisuje natywny skok;
 * - telefony i tablety (dotyk, bez myszy) w ogóle nie dostają Lenisa: systemowe przewijanie
 *   jest tam płynne, a Lenis przy chowaniu paska adresu i wysuwaniu klawiatury gubił pozycję
 *   i strona „teleportowała się”.
 */
let instance: Lenis | null = null;

/** Kto teraz blokuje przewijanie (szuflada, menu). Strona jest odblokowana, gdy nikt. */
const lockers = new Set<string>();
/** Ci, którzy dodatkowo chowają pasek przewijania strony (przeliczenie układu — nie przy animacji menu). */
const overflowLockers = new Set<string>();

function applyLock() {
  if (lockers.size > 0) instance?.stop();
  else instance?.start();
  const hide = overflowLockers.size > 0 ? "hidden" : "";
  if (document.documentElement.style.overflow !== hide) document.documentElement.style.overflow = hide;
}

/**
 * Blokada przewijania strony pod otwartą szufladą/menu. `owner` rozróżnia, kto blokuje.
 * `hideOverflow: false` zatrzymuje tylko płynne przewijanie — bez `overflow: hidden`, które
 * przelicza układ całej strony i szarpie animację otwierania pełnoekranowego menu.
 */
export function lockScroll(locked: boolean, owner = "default", { hideOverflow = true } = {}) {
  if (locked) {
    lockers.add(owner);
    if (hideOverflow) overflowLockers.add(owner);
  } else {
    lockers.delete(owner);
    overflowLockers.delete(owner);
  }
  applyLock();
}

export function scrollToTarget(selector: string, { immediate = false } = {}) {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return;
  if (instance) instance.scrollTo(el, { offset: -8, immediate, force: true });
  else el.scrollIntoView({ behavior: immediate ? "instant" : "smooth" });
}

export function scrollToY(y: number) {
  if (instance) instance.scrollTo(y, { force: true });
  else window.scrollTo({ top: y, behavior: "smooth" });
}

export function SmoothScroll() {
  const pathname = usePathname();

  // Przejście na inną stronę (np. po złożeniu zamówienia) zawsze zdejmuje blokadę —
  // inaczej strona śledzenia zostawała bez przewijania.
  useEffect(() => {
    lockers.clear();
    overflowLockers.clear();
    applyLock();
  }, [pathname]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const lenis = new Lenis({
      lerp: 0.09,
      wheelMultiplier: 1,
      smoothWheel: true,
      syncTouch: false,
      // Szuflada zamówienia, menu mobilne i karuzele przewijają się same.
      prevent: (node) => node.closest?.("[data-lenis-prevent]") != null,
    });
    instance = lenis;

    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      const link = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
      // Linki z serową zasłoną obsługuje <CheeseTransition>.
      if (!link || link.dataset.cheese !== undefined) return;
      const id = link.getAttribute("href");
      if (!id || id === "#") return;
      const el = document.querySelector(id);
      if (!el) return;

      event.preventDefault();
      lenis.scrollTo(el as HTMLElement, { offset: -8 });
      history.replaceState(null, "", id);
    };

    document.addEventListener("click", onClick);

    return () => {
      document.removeEventListener("click", onClick);
      cancelAnimationFrame(raf);
      lenis.destroy();
      instance = null;
    };
  }, []);

  return null;
}
