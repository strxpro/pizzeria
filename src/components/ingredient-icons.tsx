import type { JSX } from "react";

/**
 * Ikony wyskakujące zza kart w karuzeli — każda pozycja menu ma swoją.
 * Pełne sylwetki w jednym kolorze (`currentColor` = kolor ramki karty):
 * bez obrysu i bez detali w środku, czytelne nawet w małym rozmiarze.
 */

export const ICON_NAMES = [
  "margherita", "marinara", "diavola", "capricciosa", "funghi", "quattro", "bufalina", "tartufo", "nduja", "mortadella",
  "acqua", "coca-cola", "chinotto", "moretti", "tiramisu", "panna-cotta", "cannolo",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export const isIconName = (v: string): v is IconName => (ICON_NAMES as readonly string[]).includes(v);

const ICONS: Record<IconName, () => JSX.Element> = {
  // dwa listki bazylii na łodyżce
  margherita: () => (
    <path d="M47 100c0-14 1-26 3-36-18 2-34-10-40-30 20-6 36 2 42 20 2-20 14-38 36-46 6 26-6 48-30 56-3 10-5 22-5 36Z" />
  ),
  // czosnek
  marinara: () => <path d="M50 2c4 11 18 17 26 31 14 25 5 56-26 61C19 89 10 58 24 33 32 19 46 13 50 2Z" />,
  // papryczka
  diavola: () => (
    <path d="M70 4c-8 2-12 8-12 17-10 3-12 11-14 22-4 19-16 36-38 48 30 4 58-10 70-34 9-18 3-34-12-38 0-7 3-11 8-13Z" />
  ),
  // oliwka z listkiem
  capricciosa: () => (
    <>
      <ellipse cx="56" cy="64" rx="27" ry="33" transform="rotate(-20 56 64)" />
      <path d="M40 30C30 14 14 8 2 10c4 16 18 26 36 24Z" />
    </>
  ),
  // grzyb
  funghi: () => <path d="M2 58C2 28 24 6 50 6s48 22 48 52H66l5 38H29l5-38Z" />,
  // klin sera
  quattro: () => <path d="M2 64 94 18v72H2Z" />,
  // mozzarella zawiązana u góry
  bufalina: () => (
    <path d="M42 2h16l-2 14c22 5 38 24 38 45 0 22-19 37-44 37S6 83 6 61c0-21 16-40 38-45Z" />
  ),
  // trufla
  tartufo: () => <path d="M12 54C4 30 24 6 50 6c28 0 46 20 42 46-3 26-22 46-44 46-19 0-31-19-36-44Z" />,
  // płomień
  nduja: () => (
    <path d="M50 98c-26 0-42-17-42-38 0-24 20-34 22-58 15 9 20 24 17 36 10-5 12-17 10-29 20 12 36 32 36 52 0 21-16 37-43 37Z" />
  ),
  // pistacja
  mortadella: () => <path d="M50 2c27 0 44 24 44 50S76 98 50 98 6 78 6 52 23 2 50 2Z" />,
  // butelka wody
  acqua: () => <path d="M40 2h20v10l-3 6c14 6 21 18 21 32v42c0 4-3 6-6 6H26c-3 0-6-2-6-6V50c0-14 7-26 21-32l-1-6Z" />,
  // puszka
  "coca-cola": () => <path d="M24 8c0-4 8-6 26-6s26 2 26 6l4 8v68l-4 8c0 4-8 6-26 6s-26-2-26-6l-4-8V16Z" />,
  // mała butelka chinotto
  chinotto: () => <path d="M42 2h16v24c14 8 20 20 20 34v34c0 3-2 4-5 4H27c-3 0-5-1-5-4V60c0-14 6-26 20-34Z" />,
  // kufel piwa z pianą
  moretti: () => (
    <path d="M14 22c0-12 10-20 22-18 6-4 16-4 22 0 12-2 22 6 22 16v6h4c9 0 14 6 14 14v24c0 8-5 14-14 14h-4v8c0 6-4 10-10 10H24c-6 0-10-4-10-10Zm66 16v34h4c3 0 4-1 4-4V42c0-3-1-4-4-4Z" />
  ),
  // kawałek tiramisu
  tiramisu: () => <path d="M4 44 70 10l26 20v58c0 4-3 6-6 6H10c-4 0-6-2-6-6Z" />,
  // panna cotta z owocem
  "panna-cotta": () => (
    <>
      <path d="M22 40c0-6 12-10 28-10s28 4 28 10l12 50c1 4-2 6-6 6H16c-4 0-7-2-6-6Z" />
      <circle cx="50" cy="16" r="12" />
    </>
  ),
  // cannolo
  cannolo: () => <path d="M10 70 60 14c8-9 22-10 30-2s7 22-2 30L32 92c-8 8-20 8-26 1s-5-15 4-23Z" />,
};

export function ItemIcon({ name, className }: { name: IconName; className?: string }) {
  const Icon = ICONS[name];
  return (
    <svg viewBox="0 0 100 100" className={className} fill="currentColor" fillRule="evenodd" aria-hidden>
      <Icon />
    </svg>
  );
}
