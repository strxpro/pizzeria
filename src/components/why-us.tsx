"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { STICKER_TONES } from "@/lib/data";
import { useT } from "@/lib/i18n/provider";
import { useMedia } from "@/lib/use-media";
import { HandNote } from "./kit";
import { Liquid } from "./liquid";
import { Mark } from "./preloader";
import { StickerPhysics } from "./sticker-physics";

const TONES = {
  pomodoro: "bg-pomodoro text-ink",
  notte: "bg-notte text-paper",
  cielo: "bg-cielo text-notte",
  basilico: "bg-basilico text-ink",
  rosa: "bg-rosa text-ink",
} as const;

/** Pozycje naklejek na komputerze: [left %, top %, obrót]. */
const SPOTS = [
  [4, 16, -6],
  [55, 30, 4],
  [14, 52, 3],
  [52, 66, -5],
  [2, 80, -3],
] as const;

/**
 * „Perché noi?” jak „Why Aardvark?”: napis po łuku nad znakiem i naklejki,
 * które na komputerze da się łapać i przestawiać myszą.
 */
export function WhyUs() {
  const t = useT();
  const area = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const wide = useMedia("(min-width: 1024px)");

  return (
    <section aria-labelledby="why-title" className="panel relative isolate overflow-hidden bg-giallo py-6 lg:py-(--spacing-section)">
      <Liquid layers={[{ color: "#ffe38a", x: -20, y: -10, size: 75, seed: 51, duration: 22 }, { color: "#ffb326", x: 50, y: 40, size: 70, seed: 52, duration: 18, opacity: 0.7 }]} />

      <div ref={area} className="container-page relative lg:h-[40rem]">
        {/* komputer: naklejki rozrzucone wokół znaku, przestawiane myszą */}
        {wide ? (
          <>
            <div className="relative mx-auto w-[min(90vw,34rem)] lg:absolute lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2">
          <svg viewBox="0 0 500 170" className="w-full overflow-visible" role="img" aria-labelledby="why-title">
            <title id="why-title">{t.why.title}</title>
            <path id="why-arc" d="M40 165 A 210 150 0 0 1 460 165" fill="none" />
            <text className="fill-[#7a1033] text-[58px] font-extrabold tracking-[-0.02em]">
              <textPath href="#why-arc" startOffset="50%" textAnchor="middle">
                {t.why.title}
              </textPath>
            </text>
          </svg>
          <Mark className="mx-auto -mt-2 w-[46%] text-[#7a1033] opacity-90 lg:w-[62%]" />
        </div>

            <ul>
              {t.stickers.map((label, i) => {
                const [left, top, rotate] = SPOTS[i];
                return (
                  <motion.li
                    key={i}
                    drag={!reduced}
                    dragConstraints={area}
                    dragElastic={0.15}
                    whileDrag={{ scale: 1.06, rotate: 0, zIndex: 20, cursor: "grabbing" }}
                    initial={reduced ? false : { scale: 0, rotate: rotate * 4 }}
                    whileInView={{ scale: 1, rotate }}
                    viewport={{ once: true }}
                    transition={{ type: "spring", stiffness: 180, damping: 14, delay: i * 0.08 }}
                    style={{ left: `${left}%`, top: `${top}%` }}
                    className={`absolute cursor-grab rounded-full px-[0.5em] py-[0.12em] text-[clamp(1.7rem,5.6vw,5.2rem)] leading-[1.05] font-extrabold tracking-tight whitespace-nowrap shadow-[0_10px_0_rgb(18_12_8/0.15)] select-none ${TONES[STICKER_TONES[i]]}`}
                  >
                    {label}
                  </motion.li>
                );
              })}
            </ul>
            <HandNote rotate={-6} className="absolute right-0 bottom-0">
              {t.why.drag}
            </HandNote>
          </>
        ) : (
          /* telefon i tablet: cała sekcja jest światem fizyki — naklejki spadają, dają się rzucać, reagują na przechylenie */
          reduced ? (
            <div>
              <TitleArc title={t.why.title} />
              <ul className="mt-8 flex flex-wrap justify-center gap-x-3 gap-y-4">
                {t.stickers.map((label, i) => (
                  <li key={i} className={`rounded-full px-[0.5em] py-[0.12em] text-[1.55rem] font-extrabold whitespace-nowrap ${TONES[STICKER_TONES[i]]}`}>
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <StickerPhysics labels={t.stickers} tones={STICKER_TONES.map((k) => TONES[k])} className="h-[min(44rem,86svh)]">
              <div className="pointer-events-none relative mx-auto w-[min(86vw,26rem)] pt-4">
                <TitleArc title={t.why.title} />
              </div>
              <HandNote rotate={-4} className="pointer-events-none absolute inset-x-0 top-[46%] text-center opacity-80">
                {t.why.physics}
              </HandNote>
            </StickerPhysics>
          )
        )}
      </div>
    </section>
  );
}

/** Napis po łuku nad znakiem pizzerii. Znak jest przeszkodą w świecie fizyki (telefon). */
function TitleArc({ title }: { title: string }) {
  return (
    <>
      <svg viewBox="0 0 500 170" className="w-full overflow-visible" role="img" aria-labelledby="why-title">
        <title id="why-title">{title}</title>
        <path id="why-arc" d="M40 165 A 210 150 0 0 1 460 165" fill="none" />
        <text className="fill-[#7a1033] text-[58px] font-extrabold tracking-[-0.02em]">
          <textPath href="#why-arc" startOffset="50%" textAnchor="middle">
            {title}
          </textPath>
        </text>
      </svg>
      <div data-physics-obstacle className="mx-auto -mt-2 w-[46%]">
        <Mark className="w-full text-[#7a1033] opacity-90" />
      </div>
    </>
  );
}
