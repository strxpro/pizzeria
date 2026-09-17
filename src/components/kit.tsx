"use client";

import { motion, useReducedMotion } from "motion/react";
import { Fragment, type ComponentProps, type ElementType, type ReactNode } from "react";

/**
 * Wspólne klocki ruchu i typografii — odpowiedniki SplitText i przycisków
 * z referencji. Każdy dzielony tekst ma pełną etykietę dla czytników ekranu,
 * a pojedyncze litery/słowa są przed nimi ukryte.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

/** Nagłówek, którego słowa wyjeżdżają spod linii bazowej przy wejściu w widok. */
export function RiseText({
  text,
  as = "h2",
  className,
  delay = 0,
  immediate = false,
  play = true,
}: {
  /** `\n` łamie wiersz w tym miejscu. */
  text: string;
  as?: "h1" | "h2" | "h3" | "p";
  className?: string;
  delay?: number;
  /** Animuj bez czekania na wejście w widok (hero). */
  immediate?: boolean;
  /** Przy `immediate`: start dopiero, gdy `true` (np. po zejściu preloadera). */
  play?: boolean;
}) {
  const reduced = useReducedMotion();
  const Tag = as as ElementType;
  const lines = text.split("\n");
  let index = 0;

  return (
    <Tag className={className} aria-label={text.replace(/\n/g, " ")}>
      {lines.map((line, li) => (
        <span key={li} aria-hidden className="block">
          {line.split(" ").map((word, wi) => {
            const i = index++;
            return (
              <span key={wi} className="-mb-[0.12em] inline-block overflow-hidden pb-[0.12em] align-top">
                <motion.span
                  className="inline-block"
                  initial={reduced ? false : { y: "105%" }}
                  {...(immediate ? { animate: play ? { y: 0 } : undefined } : { whileInView: { y: 0 } })}
                  viewport={{ once: true, margin: "0px 0px -5% 0px" }}
                  transition={{ duration: 0.55, ease: EASE, delay: delay + i * 0.025 }}
                >
                  {word}
                </motion.span>
                {wi < line.split(" ").length - 1 ? " " : null}
              </span>
            );
          })}
        </span>
      ))}
    </Tag>
  );
}

/** Odręczny dopisek pisany litera po literze — jak `data-handwritten-text-inview`. */
export function HandNote({
  children,
  className,
  delay = 0,
  rotate = -6,
}: {
  children: string;
  className?: string;
  delay?: number;
  rotate?: number;
}) {
  const reduced = useReducedMotion();
  let index = 0;
  return (
    <p className={`font-hand text-hand ${className ?? ""}`} style={{ rotate: `${rotate}deg` }} aria-label={children}>
      {children.split(" ").map((word, wi) => (
        // Litery owinięte w słowo — wiersz łamie się między słowami, nie w środku.
        // Spacja musi stać POZA inline-blockiem, inaczej przeglądarka ją obcina.
        <Fragment key={wi}>
        {wi > 0 ? " " : null}
        <span aria-hidden className="inline-block whitespace-nowrap">
          {word.split("").map((ch) => {
            const i = index++;
            return (
              <motion.span
                key={i}
                className="inline-block"
                initial={reduced ? false : { opacity: 0, y: "0.3em" }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.2, ease: EASE, delay: delay + i * 0.01 }}
              >
                {ch}
              </motion.span>
            );
          })}
        </span>
        </Fragment>
      ))}
    </p>
  );
}

/** Wejście bloku w widok. */
export function Rise({
  children,
  className,
  delay = 0,
  y = 40,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

const TONES = {
  ink: "bg-ink text-paper",
  pomodoro: "bg-pomodoro text-ink",
  paper: "bg-paper text-ink",
  giallo: "bg-giallo text-ink",
} as const;

type PillProps = {
  children: string;
  tone?: keyof typeof TONES;
  arrow?: boolean;
  size?: "md" | "lg";
  className?: string;
} & (({ href: string } & Omit<ComponentProps<"a">, "children">) | ({ href?: undefined } & Omit<ComponentProps<"button">, "children">));

/**
 * Przycisk z referencji: pigułka + osobny kwadrat ze strzałką. Po najechaniu
 * tekst przewija się w górę (kopia wjeżdża od dołu), strzałka wylatuje i wraca.
 */
export function Pill({ children, tone = "ink", arrow = true, size = "md", className = "", ...rest }: PillProps) {
  const h = size === "lg" ? "h-14 text-lg" : "h-12 text-base";
  const inner = (
    <>
      <span className={`press relative inline-flex ${h} items-center overflow-hidden rounded-full px-6 font-bold ${TONES[tone]}`}>
        <span className="relative block overflow-hidden">
          <span className="block transition-transform duration-500 ease-(--ease-out) group-hover/pill:-translate-y-full">
            {children}
          </span>
          <span aria-hidden className="absolute inset-0 block translate-y-full transition-transform duration-500 ease-(--ease-out) group-hover/pill:translate-y-0">
            {children}
          </span>
        </span>
      </span>
      {arrow ? (
        <span aria-hidden className={`press relative inline-flex ${size === "lg" ? "size-14" : "size-12"} items-center justify-center overflow-hidden rounded-full ${TONES[tone]}`}>
          <Arrow className="size-5 transition-transform duration-500 ease-(--ease-out) group-hover/pill:translate-x-[180%]" />
          <Arrow className="absolute size-5 -translate-x-[180%] transition-transform duration-500 ease-(--ease-out) group-hover/pill:translate-x-0" />
        </span>
      ) : null}
    </>
  );
  const cls = `press-group group/pill inline-flex items-center gap-1.5 pb-[5px] ${className}`;

  if (rest.href !== undefined) {
    return (
      <a className={cls} {...(rest as ComponentProps<"a">)}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" className={cls} {...(rest as ComponentProps<"button">)}>
      {inner}
    </button>
  );
}

export function Plus() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden>
      <path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
}

export function Minus() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden>
      <path d="M3 10h14" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
}

export function Arrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 12h15M13 5.5l6.5 6.5-6.5 6.5" />
    </svg>
  );
}

/** Ręcznie rysowana strzałka do dopisków. */
export function Squiggle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 80" className={className} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 10c22-4 52 2 60 18 7 14-10 22-16 12-6-11 16-20 32-6 9 8 16 20 20 32" />
      <path d="M92 52l10 15 6-17" />
    </svg>
  );
}

/** Organiczne plamy tła — płaskie kształty jak w hero referencji. */
export function Blob({ className, variant = 0 }: { className?: string; variant?: 0 | 1 | 2 }) {
  const d = [
    "M421 58c86 38 166 112 158 214-8 101-92 142-170 196-78 53-150 118-246 88C67 526 3 432 11 330 19 228 64 157 139 96 214 36 335 20 421 58Z",
    "M318 14c103 8 214 60 252 158 37 97-2 181-66 256-64 74-150 139-251 128C152 545 55 462 22 360-11 258 19 155 88 88 156 21 215 6 318 14Z",
    "M60 180C92 72 212-6 330 12s192 110 246 214c55 104 28 222-66 280-93 58-203 38-300 8C112 484 28 288 60 180Z",
  ][variant];
  return (
    <svg viewBox="0 0 600 600" className={className} aria-hidden>
      <path d={d} fill="currentColor" />
    </svg>
  );
}
