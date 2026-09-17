import { de } from "./dicts/de";
import { en } from "./dicts/en";
import { es } from "./dicts/es";
import { fr } from "./dicts/fr";
import { it, type Dict } from "./dicts/it";
import { pl } from "./dicts/pl";

export type { Dict };

export const LANGS = ["it", "pl", "en", "de", "fr", "es"] as const;
export type Lang = (typeof LANGS)[number];

export const DICTS: Record<Lang, Dict> = { it, pl, en, de, fr, es };

export const DEFAULT_LANG: Lang = "it";
export const LANG_COOKIE = "lang";

export const isLang = (v: unknown): v is Lang => typeof v === "string" && (LANGS as readonly string[]).includes(v);

export const dictFor = (lang: unknown): Dict => DICTS[isLang(lang) ? lang : DEFAULT_LANG];

/** Kraj (ISO 3166-1) → język strony. Kraje spoza listy dostają angielski. */
const COUNTRY_LANG: Record<string, Lang> = {
  IT: "it", SM: "it", VA: "it",
  PL: "pl",
  DE: "de", AT: "de", LI: "de",
  FR: "fr", BE: "fr", LU: "fr", MC: "fr",
  ES: "es", MX: "es", AR: "es", CO: "es", CL: "es", PE: "es", VE: "es", UY: "es", EC: "es",
  GB: "en", IE: "en", US: "en", CA: "en", AU: "en", NZ: "en",
  CH: "de",
};

/**
 * Język przy pierwszej wizycie: zapisany wybór > kraj z geolokalizacji IP
 * (nagłówek hostingu: Vercel, Cloudflare lub własny proxy) > język przeglądarki > włoski.
 */
export function pickLang({ cookie, country, acceptLanguage }: { cookie?: string; country?: string | null; acceptLanguage?: string | null }): Lang {
  if (isLang(cookie)) return cookie;
  const byCountry = country ? COUNTRY_LANG[country.toUpperCase()] : undefined;
  if (byCountry) return byCountry;
  if (country) return "en";
  for (const part of (acceptLanguage ?? "").split(",")) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (isLang(code)) return code;
  }
  return DEFAULT_LANG;
}
