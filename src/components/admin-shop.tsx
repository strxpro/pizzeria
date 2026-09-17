"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { displayTime, isPaused, openState, type Hours, type ShopSettings } from "@/lib/format";

type AdminFetch = (url: string, init?: RequestInit) => Promise<Response>;

const DAYS = [
  [1, "Lunedì"],
  [2, "Martedì"],
  [3, "Mercoledì"],
  [4, "Giovedì"],
  [5, "Venerdì"],
  [6, "Sabato"],
  [0, "Domenica"],
] as const;

const timeFmt = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", weekday: "short", hour: "2-digit", minute: "2-digit" });

/** Wspólny stan ustawień lokalu dla paska i zakładki godzin. */
export function useShopSettings(adminFetch: AdminFetch) {
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/settings", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setSettings((await res.json()) as ShopSettings);
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(load, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load]);

  const save = async (body: object) => {
    setError("");
    const res = await adminFetch("/api/admin/settings", { method: "PATCH", body: JSON.stringify(body) }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as (ShopSettings & { error?: string }) | null;
    if (!res?.ok || !data) {
      setError(data?.error ?? "Salvataggio non riuscito.");
      return false;
    }
    setSettings(data);
    return true;
  };

  return { settings, error, save };
}

/**
 * Pasek na górze panelu: czy lokal przyjmuje zamówienia. Jedno dotknięcie „Chiudi ora”
 * pokazuje trzy duże opcje (na godzinę, do końca dnia, do odwołania); „Riapri” wznawia.
 */
export function ShopStatusBar({ shop }: { shop: ReturnType<typeof useShopSettings> }) {
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const { settings, save } = shop;
  if (!settings) return null;

  const paused = isPaused(settings);
  const state = openState(new Date(), settings);
  const forever = paused && settings.pausedUntil?.startsWith("2999");

  const act = async (pause: string) => {
    setBusy(true);
    if (await save({ pause })) setChoosing(false);
    setBusy(false);
  };

  return (
    <div className={`overflow-hidden rounded-3xl border-2 border-ink ${paused ? "bg-pomodoro" : "bg-basilico/40"}`}>
      <div className="flex items-center gap-3 p-3 pl-4">
        <span className="relative flex size-3 shrink-0">
          {!paused ? <span className="absolute inset-0 animate-ping rounded-full bg-basilico" /> : null}
          <span className={`relative size-3 rounded-full border-2 border-ink ${paused ? "bg-paper" : "bg-basilico"}`} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="leading-tight font-extrabold">{paused ? "Ordini in pausa" : state.open ? "Aperto · ordini attivi" : "Fuori orario · ordini attivi"}</p>
          <p className="truncate text-sm font-semibold opacity-75">
            {paused
              ? forever
                ? "Chiuso finché non riapri"
                : `Riapre da solo: ${timeFmt.format(new Date(settings.pausedUntil!))}`
              : state.open
                ? `Chiude alle ${state.closesAt}`
                : "Gli ordini arrivano e partono all'apertura"}
          </p>
        </div>
        {paused ? (
          <button type="button" disabled={busy} onClick={() => act("resume")} className="h-12 shrink-0 rounded-2xl border-2 border-ink bg-paper px-4 font-extrabold shadow-[0_3px_0_var(--color-ink)] active:translate-y-0.5 active:shadow-none">
            Riapri ora
          </button>
        ) : (
          <button
            type="button"
            aria-expanded={choosing}
            onClick={() => setChoosing((c) => !c)}
            className="h-12 shrink-0 rounded-2xl border-2 border-ink bg-ink px-4 font-extrabold text-paper shadow-[0_3px_0_rgb(18_12_8/0.35)] active:translate-y-0.5 active:shadow-none"
          >
            {choosing ? "Annulla" : "Chiudi ora"}
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {choosing && !paused ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="grid grid-cols-3 gap-2 border-t-2 border-ink/15 p-3"
          >
            {(
              [
                ["hour", "1 ora", "riapre da solo"],
                ["today", "Oggi", "fino a domattina"],
                ["until", "Sempre", "finché non riapri"],
              ] as const
            ).map(([kind, label, hint]) => (
              <button
                key={kind}
                type="button"
                disabled={busy}
                onClick={() => act(kind)}
                className="flex min-h-16 flex-col items-center justify-center rounded-2xl border-2 border-ink bg-paper px-1 font-extrabold active:scale-95 disabled:opacity-50"
              >
                <span className="text-lg leading-tight">{label}</span>
                <span className="text-center text-[0.7rem] leading-tight font-semibold opacity-60">{hint}</span>
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Zakładka „Orari”: każdy dzień — otwarte/zamknięte i dwie godziny. Zamknięcie po północy jest dozwolone. */
export function HoursPanel({ shop }: { shop: ReturnType<typeof useShopSettings> }) {
  const { settings, error, save } = shop;
  const [draft, setDraft] = useState<Hours[] | null>(null);
  const [saved, setSaved] = useState(false);
  if (!settings) return <p className="py-20 text-center font-bold text-ink/60">Caricamento…</p>;

  const rows = draft ?? settings.hours;
  const row = (day: number) => rows.find((h) => h.day === day) ?? { day, open: null, close: null };
  const change = (day: number, patch: Partial<Hours>) => {
    setSaved(false);
    setDraft(DAYS.map(([d]) => (d === day ? { ...row(d), ...patch } : row(d))));
  };

  return (
    <div className="mx-auto max-w-xl">
      <h2 className="text-2xl font-extrabold">Orari di apertura</h2>
      <p className="mt-1 text-sm font-semibold text-ink/60">Se chiudi dopo mezzanotte scrivi l&apos;ora del giorno dopo (es. 00:30).</p>

      <ul className="mt-5 grid grid-cols-1 gap-2">
        {DAYS.map(([day, name]) => {
          const h = row(day);
          const open = Boolean(h.open);
          return (
            <li key={day} className={`flex flex-wrap items-center gap-3 rounded-2xl border-2 border-ink p-3 ${open ? "bg-paper" : "bg-ink/5"}`}>
              <span className="w-24 font-extrabold">{name}</span>
              <button
                type="button"
                role="switch"
                aria-checked={open}
                onClick={() => change(day, open ? { open: null, close: null } : { open: "18:00", close: "23:30" })}
                className={`h-9 rounded-full border-2 border-ink px-3 text-sm font-bold ${open ? "bg-basilico" : "bg-paper"}`}
              >
                {open ? "Aperto" : "Chiuso"}
              </button>
              {open ? (
                <span className="ml-auto flex items-center gap-2">
                  <input type="time" value={h.open ?? ""} onChange={(e) => change(day, { open: e.target.value })} aria-label={`${name}: apertura`} className="h-10 rounded-xl border-2 border-ink bg-paper px-2 font-bold" />
                  <span className="font-bold">–</span>
                  <input
                    type="time"
                    value={h.close ? displayTime(h.close) : ""}
                    onChange={(e) => change(day, { close: e.target.value })}
                    aria-label={`${name}: chiusura`}
                    className="h-10 rounded-xl border-2 border-ink bg-paper px-2 font-bold"
                  />
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {error ? <p className="mt-3 rounded-2xl bg-rosa px-4 py-2.5 font-bold">{error}</p> : null}
      <button
        type="button"
        disabled={!draft}
        onClick={async () => {
          if (draft && (await save({ hours: draft }))) {
            setDraft(null);
            setSaved(true);
          }
        }}
        className="mt-5 h-14 w-full rounded-2xl border-2 border-ink bg-basilico text-lg font-extrabold shadow-[0_4px_0_var(--color-ink)] active:translate-y-1 active:shadow-none disabled:opacity-40"
      >
        {saved ? "Salvato ✓" : "Salva orari"}
      </button>
    </div>
  );
}
