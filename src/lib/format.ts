import { OPENING } from "./data";

export type Hours = { day: number; open: string | null; close: string | null };
/** Ustawienia lokalu z panelu: godziny i ręczna pauza (ISO; data daleko w przyszłości = do odwołania). */
export type ShopSettings = { hours: Hours[]; pausedUntil: string | null };

export const DEFAULT_SETTINGS: ShopSettings = { hours: OPENING.map((o) => ({ day: o.day, open: o.open, close: o.close })), pausedUntil: null };

export const isPaused = (s: ShopSettings, date = new Date()) => Boolean(s.pausedUntil && Date.parse(s.pausedUntil) > date.getTime());

const euroFormat = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

export const euro = (value: number) => euroFormat.format(value);

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** "24:30" → "00:30" — w danych godziny po północy są zapisane jako > 24. */
export const displayTime = (hhmm: string) => {
  const minutes = toMinutes(hhmm) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
};

/** Dzień tygodnia i minuta doby w Genui — niezależnie od strefy czasowej odwiedzającego. */
export function romeNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { day, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** `opensIn`: 0 = dziś, 1 = jutro, >1 = za tyle dni (`opensDay` to dzień tygodnia). */
export type OpenState =
  | { open: true; closesAt: string }
  | { open: false; paused?: boolean; opensAt: string | null; opensIn: number | null; opensDay: number | null };

export function openState(date = new Date(), settings: ShopSettings = DEFAULT_SETTINGS): OpenState {
  // ręczna pauza z panelu wygrywa z godzinami
  if (isPaused(settings, date)) return { open: false, paused: true, opensAt: null, opensIn: null, opensDay: null };
  const { day, minutes } = romeNow(date);
  const byDay = (d: number) => settings.hours.find((o) => o.day === ((d + 7) % 7));

  // Wczorajsza zmiana, która kończy się po północy.
  const yesterday = byDay(day - 1);
  if (yesterday?.close && toMinutes(yesterday.close) > 24 * 60 && minutes < toMinutes(yesterday.close) - 24 * 60) {
    return { open: true, closesAt: displayTime(yesterday.close) };
  }

  const today = byDay(day);
  if (today?.open && today.close) {
    if (minutes >= toMinutes(today.open) && minutes < toMinutes(today.close)) {
      return { open: true, closesAt: displayTime(today.close) };
    }
    if (minutes < toMinutes(today.open)) {
      return { open: false, opensAt: today.open, opensIn: 0, opensDay: day };
    }
  }

  for (let i = 1; i <= 7; i++) {
    const next = byDay(day + i);
    if (next?.open) {
      return { open: false, opensAt: next.open, opensIn: i, opensDay: next.day };
    }
  }
  return { open: false, opensAt: null, opensIn: null, opensDay: null };
}
