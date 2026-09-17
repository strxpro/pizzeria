"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { DICTS, LANGS, type Lang } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/provider";

/** Przełącznik języka: flaga + kod, lista 6 języków. Zmiana uruchamia animację liter. */
export function LangSwitch({ align = "right", up = false, className = "" }: { align?: "left" | "right"; up?: boolean; className?: string }) {
  const { lang, t, setLang } = useLang();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className={`relative ${className}`} data-no-scramble>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${t.nav.language}: ${t.lang.name}`}
        onClick={() => setOpen((o) => !o)}
        className="btn-3d btn-3d-sm flex h-11 items-center gap-1.5 rounded-full bg-paper px-3 text-sm font-extrabold"
      >
        <Flag lang={lang} />
        {t.lang.short}
      </button>
      <AnimatePresence>
        {open ? (
          <motion.ul
            id={listId}
            role="listbox"
            aria-label={t.nav.language}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97, transition: { duration: 0.12 } }}
            transition={{ type: "spring", stiffness: 500, damping: 32 }}
            className={`absolute z-50 w-48 ${up ? "bottom-full mb-3" : "top-full mt-3"} rounded-[1.5rem] border-[2.5px] border-ink bg-paper p-1.5 shadow-[0_6px_0_var(--color-ink)] ${align === "right" ? (up ? "right-0 origin-bottom-right" : "right-0 origin-top-right") : up ? "left-0 origin-bottom-left" : "left-0 origin-top-left"}`}
          >
            {LANGS.map((l) => (
              <li key={l}>
                <button
                  type="button"
                  role="option"
                  aria-selected={l === lang}
                  onClick={() => {
                    setOpen(false);
                    if (l !== lang) setLang(l);
                  }}
                  className={`flex h-11 w-full items-center gap-3 rounded-full px-3 text-left font-bold transition-colors ${l === lang ? "bg-ink text-paper" : "hover:bg-giallo"}`}
                >
                  <Flag lang={l} />
                  {DICTS[l].lang.name}
                </button>
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Flagi jako SVG — emoji flag Windows pokazuje jako same litery. */
function Flag({ lang }: { lang: Lang }) {
  const stripes: Record<Exclude<Lang, "en">, { dir: "v" | "h"; colors: string[]; weights?: number[] }> = {
    it: { dir: "v", colors: ["#009246", "#fff", "#ce2b37"] },
    fr: { dir: "v", colors: ["#0055a4", "#fff", "#ef4135"] },
    de: { dir: "h", colors: ["#000", "#dd0000", "#ffce00"] },
    pl: { dir: "h", colors: ["#fff", "#dc143c"] },
    es: { dir: "h", colors: ["#aa151b", "#f1bf00", "#aa151b"], weights: [1, 2, 1] },
  };
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0 overflow-hidden rounded-full border-2 border-ink" aria-hidden>
      <clipPath id={`flag-${lang}`}>
        <circle cx="12" cy="12" r="12" />
      </clipPath>
      <g clipPath={`url(#flag-${lang})`}>
        {lang === "en" ? (
          <>
            <rect width="24" height="24" fill="#012169" />
            <path d="M0 0 24 24M24 0 0 24" stroke="#fff" strokeWidth="5" />
            <path d="M0 0 24 24M24 0 0 24" stroke="#c8102e" strokeWidth="2" />
            <path d="M12 0v24M0 12h24" stroke="#fff" strokeWidth="7" />
            <path d="M12 0v24M0 12h24" stroke="#c8102e" strokeWidth="4" />
          </>
        ) : (
          (() => {
            const f = stripes[lang];
            const w = f.weights ?? f.colors.map(() => 1);
            const total = w.reduce((a, b) => a + b, 0);
            let at = 0;
            return f.colors.map((c, i) => {
              const size = (24 * w[i]) / total;
              const rect = f.dir === "v" ? <rect key={i} x={at} y="0" width={size} height="24" fill={c} /> : <rect key={i} x="0" y={at} width="24" height={size} fill={c} />;
              at += size;
              return rect;
            });
          })()
        )}
      </g>
    </svg>
  );
}
