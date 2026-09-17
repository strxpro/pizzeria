"use client";

import { motion, useTransform, type MotionValue } from "motion/react";
import type { ReactNode } from "react";
import { RESTAURANT } from "@/lib/data";
import { ART, PizzaArt } from "./pizza-art";

/**
 * Pudełko na pizzę w czystym CSS 3D — używane w scenie z otwieraniem i w stopce.
 *
 * Geometria: dno leży w płaszczyźnie elementu, ściany wstają ku widzowi (+Z),
 * wieczko ma zawias na górnej krawędzi. Rozmiar z CSS: `--w` (bok), `--h` (wysokość),
 * `--t` (grubość tektury — ściany i wieczko są podwójne, z przekrojem na brzegach).
 * Wszystkie ruchy to transformacje — bez przeliczania układu i bez rozmyć.
 */
export function PizzaBox({
  transform,
  lid,
  ringOpacity,
  spin,
  steam,
  className = "",
  cursor,
  lidInside,
  onPointerEnter,
  onPointerLeave,
  onClick,
}: {
  transform: MotionValue<string>;
  /** Kąt otwarcia wieczka w stopniach. */
  lid: MotionValue<number>;
  ringOpacity?: MotionValue<number>;
  spin?: MotionValue<number>;
  steam?: MotionValue<number>;
  className?: string;
  cursor?: MotionValue<string>;
  /** Treść na spodzie wieczka (np. grawerowane hasło w scenie). Z nią pudełko nie jest ukryte przed czytnikami. */
  lidInside?: ReactNode;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  onClick?: () => void;
}) {
  const lidTransform = useTransform(lid, (a) => `translateZ(var(--h)) rotateX(${a}deg)`);
  const pizzaTransform = useTransform(() => `translateZ(2px) rotate(${spin?.get() ?? 0}deg)`);

  return (
    <motion.div
      aria-hidden={lidInside ? undefined : true}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
      style={{ transform, cursor }}
      className={`relative size-(--w) [--t:calc(var(--w)*0.022)] [transform-style:preserve-3d] ${className}`}
    >
      {/* cień: gradient zamiast blur — rozmycie w scenie 3D liczyłoby się w każdej klatce */}
      <div className="absolute -inset-[14%] bg-[radial-gradient(closest-side,rgb(18_12_8/0.3),transparent)] [transform:translateZ(-2px)]" />

      {/* dno */}
      <div className="kraft absolute inset-0 overflow-hidden">
        
      </div>

      <motion.div style={{ transform: pizzaTransform }} className="absolute inset-[7%]">
        <PizzaArt {...ART.bufalina} className="w-full" />
      </motion.div>

      {steam ? (
        <motion.div style={{ opacity: steam }} className="absolute inset-[20%] [transform:translateZ(calc(var(--h)*2))]">
          {[18, 43, 68].map((left, i) => (
            <svg
              key={left}
              viewBox="0 0 20 60"
              className="steam absolute top-[10%] h-[60%] w-[14%] overflow-visible"
              style={{ left: `${left}%`, animationDelay: `${i * 0.7}s` }}
              fill="none"
              stroke="#fff8ec"
              strokeWidth="4"
              strokeLinecap="round"
            >
              <path d="M10 58c-8-10 8-18 0-28s8-18 0-28" />
            </svg>
          ))}
        </motion.div>
      ) : null}

      {/* cztery ściany z tej samej ściany obróconej wokół środka — każda ma wnętrze, nadruk i przekrój */}
      {[0, 90, 180, 270].map((k) => (
        <div key={k} className="absolute inset-0 [transform-style:preserve-3d]" style={{ transform: `rotateZ(${k}deg)` }}>
          <Wall />
        </div>
      ))}

      <motion.div style={{ transform: lidTransform }} className="absolute inset-0 origin-top [transform-style:preserve-3d]">
        {/* spód wieczka: tektura z rastrowymi falami — na nim kamera ląduje w scenie */}
        <div className="kraft absolute inset-0 overflow-hidden [backface-visibility:hidden] [transform:rotateX(180deg)]">
          
          {lidInside}
        </div>
        {/* wierzch z nadrukiem, o grubość tektury wyżej; zachodzi nad klapę */}
        <div className="absolute inset-x-0 top-0 h-[calc(100%+var(--t))] overflow-hidden [backface-visibility:hidden] [transform:translateZ(var(--t))]">
          <LidPrint ringOpacity={ringOpacity} />
        </div>
        {/* przekroje tektury na bokach i przy zawiasie */}
        <div className="flute-y absolute top-0 left-0 h-[calc(100%+var(--t))] w-(--t) origin-left [transform:rotateY(-90deg)]" />
        <div className="flute-y absolute top-0 right-0 h-[calc(100%+var(--t))] w-(--t) origin-right [transform:rotateY(90deg)]" />
        <div className="flute absolute top-0 left-0 h-(--t) w-full origin-top [transform:rotateX(90deg)]" />

        {/* przednia klapa: nachodzi na ścianę od zewnątrz */}
        <div className="absolute top-full left-0 h-(--h) w-full origin-top [transform-style:preserve-3d] [transform:rotateX(-90deg)]">
          <div className="kraft absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]" />
          {/* nadruk klapy sięga o grubość tektury wyżej — zakrywa przednią krawędź wieczka (bez dziury na rogu) */}
          <div className="absolute inset-x-0 -top-(--t) h-[calc(100%+var(--t))] overflow-hidden [backface-visibility:hidden] [transform:translateZ(var(--t))]">
            <WallPrint />
          </div>
          <div className="flute absolute top-full left-0 h-(--t) w-full origin-top [transform:rotateX(90deg)]" />
          <div className="flute-y absolute -top-(--t) left-0 h-[calc(100%+var(--t))] w-(--t) origin-left [transform:rotateY(-90deg)]" />
          <div className="flute-y absolute -top-(--t) right-0 h-[calc(100%+var(--t))] w-(--t) origin-right [transform:rotateY(90deg)]" />
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * Ściana przy krawędzi y = bok: lokalne +Z patrzy do środka pudełka, dolna krawędź elementu
 * to górny brzeg ściany. Wnętrze leży o grubość tektury bliżej środka, nadruk na zewnątrz,
 * a brzeg zakrywa pasek z przekrojem tektury falistej.
 */
function Wall() {
  return (
    <div className="absolute top-full left-0 h-(--h) w-full origin-top [transform-style:preserve-3d] [transform:rotateX(90deg)]">
      <div className="kraft absolute inset-0 [backface-visibility:hidden] [transform:translateZ(var(--t))]" />
      <div className="absolute inset-0 overflow-hidden [backface-visibility:hidden] [transform:rotateX(180deg)]">
        <WallPrint />
      </div>
      <div className="flute absolute top-full left-0 h-(--t) w-full origin-top [transform:rotateX(90deg)]" />
    </div>
  );
}

function WallPrint() {
  return (
    <svg viewBox="0 0 400 60" preserveAspectRatio="none" className="absolute inset-0 size-full">
      <rect width="400" height="60" fill="#2d2270" />
      <path d="M0 40C60 10 110 60 180 30S300 0 400 35V60H0Z" fill="#ff5a36" />
      <path d="M0 55C80 35 140 60 220 45S340 25 400 50V60H0Z" fill="#ffd5e5" />
    </svg>
  );
}

function LidPrint({ ringOpacity }: { ringOpacity?: MotionValue<number> }) {
  return (
    <svg viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" className="size-full" aria-hidden>
      <rect width="400" height="400" fill="#2d2270" />
      <path d="M-20 90C60 20 140 160 220 90S340 -10 420 60V-20H-20Z" fill="#ff5a36" />
      <path d="M-20 260C70 180 150 330 240 250S360 170 420 220V420H-20Z" fill="#ffd5e5" />
      <path d="M-20 330C80 280 150 400 250 340S370 300 420 330V420H-20Z" fill="#ffcf3f" />
      <path d="M40 150C120 120 170 210 250 170S360 120 400 150" stroke="#9fe3ff" strokeWidth="26" fill="none" strokeLinecap="round" />
      <circle cx="200" cy="200" r="78" fill="#120c08" />
      <circle cx="200" cy="200" r="70" fill="none" stroke="#fff8ec" strokeWidth="3" />
      <defs>
        <path id="lid-ring" d="M200 200m-52 0a52 52 0 1 1 104 0a52 52 0 1 1 -104 0" />
      </defs>
      <motion.text style={ringOpacity ? { opacity: ringOpacity } : undefined} fill="#fff8ec" fontSize="15" fontWeight="800" letterSpacing="2">
        <textPath href="#lid-ring">{`${RESTAURANT.name.toUpperCase()} · GENOVA · FORNO A LEGNA ·`}</textPath>
      </motion.text>
      <path d="M200 176 L216 206 Q200 214 184 206 Z" fill="#ffcf3f" />
    </svg>
  );
}

/** Rastrowe fale jak nadruk wewnątrz pudełka z referencji. */
export function Halftone({ className = "absolute inset-0 size-full", slice = false }: { className?: string; slice?: boolean }) {
  return (
    <svg viewBox="0 0 400 400" preserveAspectRatio={slice ? "xMidYMid slice" : "none"} className={className} aria-hidden>
      <defs>
        <pattern id="dots" width="9" height="9" patternUnits="userSpaceOnUse">
          <circle cx="4.5" cy="4.5" r="2.2" fill="#120c08" />
        </pattern>
      </defs>
      <path d="M-20 120C60 40 120 200 210 120S330 30 420 110" stroke="url(#dots)" strokeWidth="48" fill="none" opacity="0.55" />
      <path d="M-20 300C80 220 150 360 250 280S360 220 420 280" stroke="url(#dots)" strokeWidth="40" fill="none" opacity="0.45" />
    </svg>
  );
}
