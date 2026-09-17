"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * Płynne tło jak w referencji: miękkie plamy, które bez końca się obracają
 * i „oddychają”.
 *
 * Wydajność: każda plama to osobna warstwa animowana wyłącznie przez `transform`
 * (CSS, na kompozytorze) — przeglądarka nie przerysowuje kształtu w żadnej klatce.
 * Poza ekranem animacja jest wstrzymana. Kształty liczone deterministycznie
 * i zaokrąglone, żeby serwer i przeglądarka wyrenderowały ten sam HTML.
 */

const POINTS = 9;
const r1 = (n: number) => Math.round(n * 10) / 10;

function rand(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function blobPath(seed: number, wobble = 0.5) {
  const pts = Array.from({ length: POINTS }, (_, i) => {
    const a = (i / POINTS) * Math.PI * 2;
    const r = 200 * (1 - wobble / 2 + rand(seed + i * 7.1) * wobble);
    return [300 + Math.cos(a) * r, 300 + Math.sin(a) * r] as const;
  });
  // Catmull-Rom → Bézier: gładka krzywa przez wszystkie punkty.
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < POINTS; i++) {
    const p0 = pts[(i - 1 + POINTS) % POINTS];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % POINTS];
    const p3 = pts[(i + 2) % POINTS];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return `${d} Z`;
}

export type LiquidLayer = {
  color: string;
  /** Pozycja lewego górnego rogu i szerokość — w procentach sekcji. */
  x: number;
  y: number;
  size: number;
  seed: number;
  /** Sekundy na pełny obrót. */
  duration?: number;
  opacity?: number;
};

export function Liquid({ layers, className = "" }: { layers: LiquidLayer[]; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "100px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} aria-hidden data-paused={visible ? undefined : ""} className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className}`}>
      {layers.map((l, i) => (
        <svg
          key={i}
          viewBox="0 0 600 600"
          className="liquid-blob absolute"
          style={
            {
              left: `${l.x}%`,
              top: `${l.y}%`,
              width: `${l.size}%`,
              opacity: l.opacity ?? 1,
              "--dur": `${(l.duration ?? 20) * 2.5}s`,
            } as CSSProperties
          }
        >
          <path d={blobPath(l.seed * 31)} fill={l.color} />
        </svg>
      ))}
    </div>
  );
}
