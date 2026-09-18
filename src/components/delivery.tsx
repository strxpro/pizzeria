"use client";

import { useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef, useState } from "react";
import { RESTAURANT, ZONES } from "@/lib/data";
import { euro } from "@/lib/format";
import { useScrollSpring } from "@/lib/scroll-spring";
import { useT } from "@/lib/i18n/provider";
import { useOrder } from "@/lib/order";
import { HandNote, Pill } from "./kit";
import { Liquid } from "./liquid";
import { LocateButton } from "./locate-button";

/**
 * Dostawa: napis po krzywej przepływa przez cały ekran razem z przewijaniem,
 * a pod nim żółty panel — po lewej mapa Google z pizzerią, po prawej wybór
 * dostawa/odbiór i „użyj mojej pozycji” (strefa liczy się sama).
 */
export function Delivery() {
  const t = useT();
  const curve = useRef<HTMLDivElement>(null);
  const textPath = useRef<SVGTextPathElement>(null);
  const reduced = useReducedMotion();
  const { mode, zone, located, setMode, setOpen, count } = useOrder();

  // Od wejścia napisu na ekran do jego wyjścia: wjeżdża zza prawej krawędzi i wyjeżdża w lewo.
  const { scrollYProgress } = useScroll({ target: curve, offset: ["start end", "end start"] });
  const offset = useScrollSpring(useTransform(scrollYProgress, [0, 1], [78, -48]), { stiffness: 130, damping: 26 }, 26);
  useMotionValueEvent(offset, "change", (v) => {
    if (!reduced) textPath.current?.setAttribute("startOffset", `${v}%`);
  });

  const minFee = Math.min(...ZONES.map((z) => z.fee));
  const facts =
    mode === "ritiro"
      ? [
          [t.delivery.cost, t.common.free],
          [t.delivery.readyIn, `${RESTAURANT.prepMinutes + 5} min`],
        ]
      : located && zone
        ? [
            [t.delivery.fee, euro(zone.fee)],
            [t.delivery.arrives, `${RESTAURANT.prepMinutes + zone.minutes} min`],
          ]
        : [
            [t.delivery.fee, t.delivery.from(euro(minFee))],
            [t.delivery.arrives, `${RESTAURANT.prepMinutes + ZONES[0].minutes}–${RESTAURANT.prepMinutes + ZONES[ZONES.length - 1].minutes} min`],
          ];

  return (
    <section id="consegna" className="relative pt-10 pb-6">
      <h2 className="sr-only">{t.delivery.heading}</h2>
      <div ref={curve}>
      <svg viewBox="0 0 1920 300" className="block w-[180%] max-w-none -translate-x-[22%] overflow-visible sm:w-full sm:translate-x-0" aria-hidden>
        <path id="curva" d="M-165.5 288 C33.686 173 810 0 1304 0 C1797.99 0 2262.5 178.181 2741.5 272" fill="none" />
        <text className="fill-ink text-[180px] font-extrabold tracking-[-0.03em]">
          <textPath ref={textPath} href="#curva" startOffset={reduced ? "12%" : "78%"}>
            {t.delivery.curve}
          </textPath>
        </text>
      </svg>
      </div>

      <div className="relative isolate mx-3 mt-6 overflow-hidden rounded-(--radius-panel) bg-giallo py-(--spacing-section) md:mx-4">
        <Liquid layers={[{ color: "#ffe38a", x: -10, y: 40, size: 60, seed: 41, duration: 20 }, { color: "#ffb326", x: 60, y: -25, size: 55, seed: 42, duration: 24, opacity: 0.8 }]} />

        <div className="container-page grid gap-12 lg:grid-cols-2 lg:gap-16">
          <MapCard />

          <div className="flex flex-col">
            <p className="text-[clamp(2rem,4.4vw,4rem)] leading-[0.92] font-extrabold tracking-tight">
              {t.delivery.free(RESTAURANT.freeDeliveryFrom)}
            </p>
            <p className="mt-5 max-w-[42ch] text-lg leading-snug font-semibold">
              {t.delivery.text}
            </p>

            <div role="radiogroup" aria-label={t.delivery.modeAria} className="mt-8 grid grid-cols-2 gap-3">
              {(["domicilio", "ritiro"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={`btn-3d flex min-h-16 flex-col items-start justify-center rounded-[1.5rem] px-5 py-3 text-left ${mode === m ? "bg-ink text-giallo" : "bg-paper"}`}
                >
                  <span className="text-lg leading-tight font-extrabold sm:text-xl">{m === "domicilio" ? t.delivery.home : t.delivery.pickup}</span>
                  <span className="text-sm font-bold opacity-80">{m === "domicilio" ? t.delivery.homeSub : t.delivery.pickupSub}</span>
                </button>
              ))}
            </div>

            {mode === "domicilio" ? (
              <div className="mt-4">
                <LocateButton />
                <HandNote rotate={-3} className="-mt-1 text-xl">
                  {t.delivery.zoneNote}
                </HandNote>
              </div>
            ) : null}

            <dl className="mt-6 grid grid-cols-2 border-y-[2.5px] border-ink">
              {facts.map(([label, value], i) => (
                <div key={label} className={`py-4 ${i ? "border-l-[2.5px] border-ink pl-4" : ""}`}>
                  <dt className="font-bold">{label}</dt>
                  <dd className="tabular mt-1 text-[clamp(1.4rem,2.8vw,2.4rem)] leading-none font-extrabold tracking-tight">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-8">
              {count > 0 ? (
                <Pill tone="ink" onClick={() => setOpen(true)}>
                  {t.delivery.complete}
                </Pill>
              ) : (
                <Pill href="#menu" tone="ink">
                  {t.delivery.choose}
                </Pill>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Mapa Google osadzona bez klucza API. Dopóki klient jej nie kliknie, nie łapie
 * kółka myszy — inaczej przewijanie strony „utykałoby” na mapie.
 */
function MapCard() {
  const t = useT();
  const [active, setActive] = useState(false);
  const src = `https://www.google.com/maps?q=${encodeURIComponent(RESTAURANT.mapsQuery)}&output=embed`;

  return (
    <div className="flex flex-col">
      <div className="relative -rotate-1 overflow-hidden rounded-[2rem] border-[2.5px] border-ink bg-paper shadow-[0_8px_0_var(--color-ink)]">
        <iframe
          title={t.delivery.mapTitle(RESTAURANT.mapsQuery)}
          src={src}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className={`block aspect-[4/3.4] w-full ${active ? "" : "pointer-events-none"}`}
        />
        {active ? null : (
          <button
            type="button"
            onClick={() => setActive(true)}
            className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-ink/35 to-transparent pb-5"
          >
            <span className="btn-3d btn-3d-sm rounded-full bg-paper px-4 py-2 text-sm font-bold">{t.delivery.mapTap}</span>
          </button>
        )}
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-hand text-2xl">{t.delivery.visit}</p>
          <p className="text-lg leading-tight font-extrabold">
            {RESTAURANT.street}, {RESTAURANT.city}
          </p>
        </div>
        <a href={RESTAURANT.mapsUrl} target="_blank" rel="noreferrer" className="btn-3d btn-3d-sm mb-1 inline-flex h-11 items-center rounded-full bg-paper px-5 font-bold">
          {t.delivery.openMaps}
        </a>
      </div>
    </div>
  );
}
