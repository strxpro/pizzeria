"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { RESTAURANT } from "@/lib/data";
import { useT } from "@/lib/i18n/provider";
import { HandNote, RiseText } from "./kit";
import { Mark } from "./preloader";

/** Pytania, po których odpowiedzi czat podsuwa przycisk (indeks w `t.faq.list`). */
const ACTIONS: Record<number, { href: string; label: "ordersCta" }> = {
  4: { href: "/i-miei-ordini", label: "ordersCta" },
};

/**
 * Pytania jako mała rozmowa: po lewej pytania do wyboru (przyciski 3D),
 * po prawej okienko czatu — pytanie klienta, chwila „pisania” i odpowiedź.
 * Zawsze widać jedną odpowiedź, więc sekcja zajmuje mało miejsca.
 */
export function Faq() {
  const t = useT();
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const [typing, setTyping] = useState(false);
  const [question, answer] = t.faq.list[active];
  const action = ACTIONS[active];

  useEffect(() => {
    if (!typing) return;
    const timer = setTimeout(() => setTyping(false), 650);
    return () => clearTimeout(timer);
  }, [typing]);

  const ask = (i: number) => {
    if (i === active) return;
    setActive(i);
    if (!reduced) setTyping(true);
  };

  return (
    <section id="faq" className="bg-paper py-[calc(var(--spacing-section)*0.8)]">
      <div className="container-page grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        <div>
          <RiseText key={t.faq.title} text={t.faq.title} className="text-giant" />
          <HandNote rotate={-4} className="mt-3">
            {t.faq.note}
          </HandNote>

          <div role="tablist" aria-label={t.faq.listAria} className="mt-8 flex flex-wrap gap-x-2.5 gap-y-3.5">
            {t.faq.list.map(([q], i) => (
              <button
                key={i}
                type="button"
                role="tab"
                id={`faq-tab-${i}`}
                aria-selected={active === i}
                aria-controls="faq-chat"
                onClick={() => ask(i)}
                className={`btn-3d btn-3d-sm rounded-full px-4 py-2.5 text-left text-[0.95rem] leading-tight font-bold ${active === i ? "bg-ink text-paper" : "bg-paper hover:bg-giallo"}`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        <div
          id="faq-chat"
          role="tabpanel"
          aria-labelledby={`faq-tab-${active}`}
          className="flex min-h-[21rem] flex-col rounded-[2rem] border-[2.5px] border-ink bg-cielo p-5 shadow-[0_8px_0_var(--color-ink)] sm:p-7"
        >
          <div className="flex items-center gap-3 border-b-[2.5px] border-ink pb-4">
            <span className="flex size-11 items-center justify-center rounded-full border-[2.5px] border-ink bg-giallo">
              <Mark className="size-7" />
            </span>
            <div>
              <p className="leading-none font-extrabold">{RESTAURANT.name}</p>
              <p className="text-sm font-semibold">{t.faq.replies}</p>
            </div>
          </div>

          <div className="flex flex-1 flex-col justify-end gap-3 pt-5" aria-live="polite">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.p
                key={`q-${active}`}
                initial={reduced ? false : { opacity: 0, y: 16, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ type: "spring", stiffness: 420, damping: 30 }}
                className="max-w-[85%] origin-bottom-right self-end rounded-[1.4rem] rounded-br-md border-[2.5px] border-ink bg-giallo px-4 py-3 font-bold"
              >
                {question}
              </motion.p>

              {typing ? (
                <motion.p
                  key="typing"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex w-fit items-center gap-1.5 rounded-[1.4rem] rounded-bl-md border-[2.5px] border-ink bg-paper px-4 py-4"
                  aria-label={t.faq.typing}
                >
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="size-2 animate-bounce rounded-full bg-ink" style={{ animationDelay: `${d * 0.12}s` }} />
                  ))}
                </motion.p>
              ) : (
                <motion.p
                  key={`a-${active}`}
                  initial={reduced ? false : { opacity: 0, y: 16, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ type: "spring", stiffness: 420, damping: 30 }}
                  className="max-w-[88%] origin-bottom-left rounded-[1.4rem] rounded-bl-md border-[2.5px] border-ink bg-paper px-4 py-3 text-lg leading-snug font-semibold"
                >
                  {answer}
                </motion.p>
              )}
              {!typing && action ? (
                <motion.div
                  key={`cta-${active}`}
                  initial={reduced ? false : { opacity: 0, y: 12, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 420, damping: 28, delay: reduced ? 0 : 0.18 }}
                  className="origin-bottom-left"
                >
                  <Link href={action.href} className="btn-3d btn-3d-sm mb-1 inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 font-extrabold text-paper">
                    {t.faq[action.label]}
                    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M4 12h15M13 5.5l6.5 6.5-6.5 6.5" />
                    </svg>
                  </Link>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <p className="mt-5 text-sm font-bold">
            {t.faq.other}{" "}
            <a href={RESTAURANT.phoneHref} className="underline decoration-2 underline-offset-4">
              {t.faq.callAt(RESTAURANT.phone)}
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
