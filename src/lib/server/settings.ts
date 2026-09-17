import { OPENING } from "../data";
import { romeNow, type Hours, type ShopSettings } from "../format";
import { jsonStore } from "./json-store";

/**
 * Ustawienia lokalu z panelu admina (`.data/settings.json`): godziny otwarcia na każdy dzień
 * i „pauza” — lokal zamknięty ręcznie na godzinę, do końca dnia albo do odwołania.
 * W czasie pauzy strona pokazuje „zamknięte”, a serwer nie przyjmuje zamówień.
 */
const seed = (): ShopSettings => ({
  hours: OPENING.map((o) => ({ day: o.day, open: o.open, close: o.close })),
  pausedUntil: null,
});

const store = jsonStore<ShopSettings>("settings.json", seed);

export class SettingsError extends Error {}

export const getSettings = () => store.read();

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Godziny z formularza: zamknięcie wcześniej niż otwarcie = po północy (zapis „24:30”). */
export async function saveHours(input: unknown) {
  if (!Array.isArray(input) || input.length !== 7) throw new SettingsError("Orari non validi.");
  const hours: Hours[] = [];
  for (const row of input as Partial<Hours>[]) {
    const day = Number(row.day);
    if (!Number.isInteger(day) || day < 0 || day > 6 || hours.some((h) => h.day === day)) throw new SettingsError("Giorno non valido.");
    if (!row.open || !row.close) {
      hours.push({ day, open: null, close: null });
      continue;
    }
    const open = String(row.open);
    let close = String(row.close);
    if (!TIME.test(open)) throw new SettingsError(`Orario di apertura non valido (${open}).`);
    if (/^24:|^2[5-9]:/.test(close)) close = `${String(Number(close.slice(0, 2)) - 24).padStart(2, "0")}${close.slice(2)}`;
    if (!TIME.test(close)) throw new SettingsError(`Orario di chiusura non valido (${close}).`);
    if (minutes(close) <= minutes(open)) {
      // chiusura dopo mezzanotte (es. 00:30 → „24:30”), al massimo fino alle 06:00
      if (minutes(close) > 6 * 60) throw new SettingsError(`La chiusura (${close}) deve essere dopo l'apertura (${open}).`);
      close = `${Number(close.slice(0, 2)) + 24}${close.slice(2)}`;
    }
    hours.push({ day, open, close });
  }
  return store.mutate((db) => {
    db.hours = hours;
    return db;
  });
}

/** Pauza: `hour` = za godzinę wraca sama, `today` = do 6:00 następnego dnia (czas Genui), `until` = do odwołania. */
export async function setPause(kind: unknown) {
  const now = Date.now();
  let until: string | null = null;
  if (kind === "hour") until = new Date(now + 60 * 60_000).toISOString();
  else if (kind === "today") {
    const { minutes: m } = romeNow();
    until = new Date(now + (24 * 60 - m + 6 * 60) * 60_000).toISOString();
  } else if (kind === "until") until = "2999-12-31T00:00:00.000Z";
  else if (kind !== null && kind !== "resume") throw new SettingsError("Scelta non valida.");
  return store.mutate((db) => {
    db.pausedUntil = until;
    return db;
  });
}
