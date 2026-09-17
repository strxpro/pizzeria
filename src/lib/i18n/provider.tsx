"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { DICTS, LANG_COOKIE, type Dict, type Lang } from "./index";

type LangContextValue = { lang: Lang; t: Dict; setLang: (lang: Lang) => void };

const LangContext = createContext<LangContextValue | null>(null);

export function LangProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  const pending = useRef(false);

  const setLang = useCallback((next: Lang) => {
    document.cookie = `${LANG_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
    document.documentElement.lang = next;
    pending.current = true;
    // Przenikanie całego widoku (View Transitions): zmiana długości tekstów nie „skacze”,
    // tylko płynnie przechodzi. Tam, gdzie API nie ma, zostaje samo mieszanie liter.
    const doc = document as Document & { startViewTransition?: (update: () => void) => unknown };
    if (doc.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      doc.startViewTransition(() => flushSync(() => setLangState(next)));
    } else {
      setLangState(next);
    }
  }, []);

  // Po podmianie tekstów (React już je wstawił) — litery „przeskakują” na nowe.
  useLayoutEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    scrambleVisibleText();
  }, [lang]);

  const value = useMemo(() => ({ lang, t: DICTS[lang], setLang }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

function useLangContext() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("Brak <LangProvider>");
  return ctx;
}

export const useT = () => useLangContext().t;
export const useLang = () => useLangContext();

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";

/** Losowy znak tej samej klasy (wielka/mała litera/cyfra) — szerokość słowa prawie się nie zmienia. */
function glyphFor(ch: string, seed: number) {
  const set = /[0-9]/.test(ch) ? DIGITS : ch === ch.toUpperCase() && ch !== ch.toLowerCase() ? UPPER : ch !== ch.toUpperCase() ? LOWER : "";
  if (!set) return ch;
  const x = Math.sin(seed * 91.17) * 43758.5453;
  return set[Math.floor((x - Math.floor(x)) * set.length)];
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * Animacja zmiany języka: krótkie teksty w oknie (nagłówki, przyciski, etykiety) przez
 * chwilę pokazują znaki tej samej klasy, a potem „lądują” na nowych — łagodną falą
 * od lewej. Długie akapity tylko przenikają razem z widokiem.
 *
 * Płynność: znaki zmieniają się co ~60 ms (nie w każdej klatce), `nodeValue` zapisujemy
 * tylko, gdy tekst faktycznie się zmienił, a na końcu zostaje dokładnie tekst od Reacta.
 * Przy `prefers-reduced-motion` nie robi nic.
 */
function scrambleVisibleText() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      const text = node.nodeValue?.trim();
      if (!parent || !text || text.length > 48) return NodeFilter.FILTER_REJECT;
      if (parent.closest("script, style, textarea, input, select, option, [data-no-scramble], svg")) return NodeFilter.FILTER_REJECT;
      const r = parent.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw || r.width === 0) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const items: { node: Text; final: string; delay: number; written: string; dropped: boolean }[] = [];
  while (walker.nextNode() && items.length < 240) {
    const node = walker.currentNode as Text;
    const left = node.parentElement!.getBoundingClientRect().left;
    const final = node.nodeValue ?? "";
    items.push({ node, final, delay: (Math.max(0, left) / vw) * 220, written: final, dropped: false });
  }
  if (!items.length) return;

  const run = ++generation;
  const DURATION = 620;
  const TICK = 60;
  const start = performance.now();
  const frame = (now: number) => {
    // Kolejna zmiana języka w trakcie — ta animacja oddaje pole nowej.
    if (run !== generation) {
      for (const it of items) if (!it.dropped && it.node.nodeValue === it.written) it.node.nodeValue = it.final;
      return;
    }
    const elapsed = now - start;
    const tick = Math.floor(elapsed / TICK);
    let running = false;
    items.forEach((it, n) => {
      if (it.dropped || !it.node.isConnected) return;
      // React zmienił tekst w trakcie (np. licznik) — zostawiamy jego wersję.
      if (it.node.nodeValue !== it.written) {
        it.dropped = true;
        return;
      }
      const p = easeOut(Math.min(1, Math.max(0, (elapsed - it.delay) / DURATION)));
      if (p < 1) running = true;
      let out = it.final;
      if (p < 1) {
        const settled = Math.floor(it.final.length * p);
        out = it.final.slice(0, settled);
        for (let i = settled; i < it.final.length; i++) out += glyphFor(it.final[i], tick * 31 + i * 7 + n * 13);
      }
      if (out !== it.written) {
        it.written = out;
        it.node.nodeValue = out;
      }
    });
    if (running) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

let generation = 0;
