import { useId } from "react";

/**
 * Generowana grafika pizzy.
 *
 * Referencja opiera się na fotografii produktu. Tu fotografii nie ma, więc
 * każda pizza jest rysowana z parametrów: inny zestaw dodatków daje wizualnie
 * inną pizzę, a plik waży kilka kilobajtów zamiast kilkuset.
 *
 * Pozycje liczone są deterministycznie (bez `Math.random()`) i zaokrąglane,
 * żeby serwer i przeglądarka wyrenderowały identyczny SVG.
 */

type Dodatek =
  | "salame"
  | "bufala"
  | "basilico"
  | "funghi"
  | "olive"
  | "formaggi"
  | "tartufo";

export type PizzaArtProps = {
  dodatki: Dodatek[];
  /** Czy pizza ma sos pomidorowy (bianca = bez). */
  sos?: boolean;
  className?: string;
  /** Ziarno przesuwa rozkład dodatków, żeby dwie pizze nie były identyczne. */
  ziarno?: number;
};

/**
 * Zaokrąglenie do setnych jest konieczne, nie kosmetyczne: `Math.cos`/`Math.sin`
 * potrafią różnić się na ostatniej cyfrze między Node a przeglądarką
 * (np. 145.43084818122477 vs 145.4308481812248), co psuje hydratację SVG.
 */
const r2 = (n: number) => Math.round(n * 100) / 100;

function pierscien(ile: number, promien: number, przesuniecie: number) {
  return Array.from({ length: ile }, (_, i) => {
    const kat = (i / ile) * Math.PI * 2 + przesuniecie;
    return { x: r2(100 + Math.cos(kat) * promien), y: r2(100 + Math.sin(kat) * promien) };
  });
}

/** Nieregularna, „roztopiona” plama wokół punktu — gładka krzywa przez 7 punktów o zmiennym promieniu. */
function plama(cx: number, cy: number, r: number, seed: number) {
  const n = 7;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + seed;
    const k = 0.72 + ((Math.sin(seed * 9.1 + i * 2.7) + 1) / 2) * 0.46;
    return [cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k] as const;
  });
  let d = `M${r2((pts[0][0] + pts[1][0]) / 2)} ${r2((pts[0][1] + pts[1][1]) / 2)}`;
  for (let i = 1; i <= n; i++) {
    const c = pts[i % n];
    const nx = pts[(i + 1) % n];
    d += ` Q${r2(c[0])} ${r2(c[1])} ${r2((c[0] + nx[0]) / 2)} ${r2((c[1] + nx[1]) / 2)}`;
  }
  return `${d}Z`;
}

export function PizzaArt({
  dodatki,
  sos = true,
  className,
  ziarno = 0,
}: PizzaArtProps) {
  // Unikalne identyfikatory gradientów dla każdej pizzy na stronie (stabilne między serwerem a przeglądarką).
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const g = (name: string) => `${id}-${name}`;
  const url = (name: string) => `url(#${g(name)})`;
  const p = ziarno * 0.7;
  const cetki = pierscien(14, 87, 0.4 + p);
  const serPlamy = [...pierscien(5, 30, 0.8 + p), ...pierscien(8, 58, 0.2 + p)];

  return (
    <svg viewBox="0 0 200 200" className={className} role="presentation" aria-hidden>
      <defs>
        {/* rant: jasny, wyrośnięty grzbiet i ciemniejszy, wypieczony brzeg */}
        <radialGradient id={g("crust")} cx="50%" cy="50%" r="50%">
          <stop offset="78%" stopColor="#d99a4e" />
          <stop offset="86%" stopColor="#f0c77f" />
          <stop offset="93%" stopColor="#e2a85c" />
          <stop offset="100%" stopColor="#b8742f" />
        </radialGradient>
        <radialGradient id={g("sauce")} cx="45%" cy="42%" r="60%">
          <stop offset="0%" stopColor="#e2553a" />
          <stop offset="70%" stopColor="#c93b22" />
          <stop offset="100%" stopColor="#a52c18" />
        </radialGradient>
        <radialGradient id={g("bianca")} cx="45%" cy="42%" r="60%">
          <stop offset="0%" stopColor="#fbf1d6" />
          <stop offset="100%" stopColor="#ecd6a6" />
        </radialGradient>
        <radialGradient id={g("cheese")} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#fffdf5" />
          <stop offset="65%" stopColor="#fbefcb" />
          <stop offset="100%" stopColor="#efd59a" />
        </radialGradient>
        <radialGradient id={g("char")}>
          <stop offset="0%" stopColor="#4a250d" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#6b3a15" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={g("salame")} cx="40%" cy="38%" r="65%">
          <stop offset="0%" stopColor="#c8433a" />
          <stop offset="85%" stopColor="#9e2a22" />
          <stop offset="100%" stopColor="#7d1f18" />
        </radialGradient>
        <radialGradient id={g("light")} cx="32%" cy="28%" r="75%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="55%" stopColor="#fff" stopOpacity="0" />
          <stop offset="100%" stopColor="#3a1a05" stopOpacity="0.18" />
        </radialGradient>
        <linearGradient id={g("leaf")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5fa84b" />
          <stop offset="100%" stopColor="#2f6b27" />
        </linearGradient>
      </defs>

      {/* ciasto z rantem i wypieczonymi cętkami */}
      <circle cx="100" cy="100" r="95" fill={url("crust")} />
      {cetki.map((s, i) => (
        <ellipse
          key={`c-${i}`}
          cx={s.x}
          cy={s.y}
          rx={3 + (i % 3) * 2.2}
          ry={2.2 + (i % 2) * 1.6}
          fill={url("char")}
          transform={`rotate(${i * 33} ${s.x} ${s.y})`}
        />
      ))}

      {/* sos (albo biała baza) z cieniem pod rantem */}
      <circle cx="100" cy="100" r="80" fill={sos ? url("sauce") : url("bianca")} />
      <circle cx="100" cy="100" r="79" fill="none" stroke="#5a2a0c" strokeOpacity="0.28" strokeWidth="3" />

      {/* roztopiona mozzarella z przyrumienionymi miejscami */}
      {serPlamy.map((s, i) => (
        <g key={`m-${i}`}>
          <path d={plama(s.x, s.y, 13 + (i % 3) * 3, i + p)} fill={url("cheese")} />
          {i % 3 === 0 ? <circle cx={r2(s.x + 3)} cy={r2(s.y + 2)} r="2.6" fill="#d9a55a" opacity="0.45" /> : null}
        </g>
      ))}

      {dodatki.includes("salame") &&
        pierscien(9, 50, 1.1 + p).map((s, i) => (
          <g key={`s-${i}`}>
            <circle cx={s.x} cy={r2(s.y + 1.5)} r="10.5" fill="#3a1206" opacity="0.18" />
            <circle cx={s.x} cy={s.y} r="10" fill={url("salame")} />
            <circle cx={r2(s.x - 3)} cy={r2(s.y - 2)} r="1.8" fill="#efc2b3" opacity="0.9" />
            <circle cx={r2(s.x + 3)} cy={r2(s.y + 2.5)} r="1.4" fill="#efc2b3" opacity="0.9" />
            <circle cx={r2(s.x + 1)} cy={r2(s.y - 4.5)} r="1.1" fill="#efc2b3" opacity="0.8" />
            <path d={`M${r2(s.x - 7)} ${r2(s.y - 3)} Q${r2(s.x - 4)} ${r2(s.y - 8)} ${r2(s.x + 1)} ${r2(s.y - 8.5)}`} stroke="#fff" strokeOpacity="0.35" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </g>
        ))}

      {dodatki.includes("bufala") &&
        pierscien(5, 42, 0.3 + p).map((s, i) => (
          <g key={`bf-${i}`}>
            <path d={plama(s.x, r2(s.y + 1.5), 16, i * 1.7 + p)} fill="#6b3a15" opacity="0.14" />
            <path d={plama(s.x, s.y, 15, i * 1.7 + p)} fill="#fffdf8" />
            <ellipse cx={r2(s.x - 4)} cy={r2(s.y - 4)} rx="5" ry="3" fill="#fff" opacity="0.9" />
          </g>
        ))}

      {dodatki.includes("funghi") &&
        pierscien(7, 55, 0.9 + p).map((s, i) => (
          <g key={`f-${i}`} transform={`rotate(${i * 51} ${s.x} ${s.y})`}>
            <path d={`M ${s.x - 9} ${s.y} a 9 7 0 0 1 18 0 l -5 0 l 0 7 l -8 0 l 0 -7 Z`} fill="#9a7552" />
            <path d={`M ${s.x - 9} ${s.y} a 9 7 0 0 1 18 0 Z`} fill="#6e4f34" opacity="0.55" />
            <path d={`M ${s.x - 4} ${s.y} l 0 6 M ${s.x + 4} ${s.y} l 0 6`} stroke="#c9ab87" strokeWidth="1" />
          </g>
        ))}

      {dodatki.includes("olive") &&
        pierscien(8, 64, 0.5 + p).map((s, i) => (
          <g key={`o-${i}`}>
            <circle cx={s.x} cy={s.y} r="6" fill="#2e271d" />
            <circle cx={s.x} cy={s.y} r="2.4" fill="#b8321f" />
            <circle cx={r2(s.x - 2.4)} cy={r2(s.y - 2.6)} r="1.3" fill="#fff" opacity="0.45" />
          </g>
        ))}

      {dodatki.includes("formaggi") &&
        pierscien(6, 46, 1.4 + p).map((s, i) => (
          <g key={`fo-${i}`} transform={`rotate(${i * 63} ${s.x} ${s.y})`}>
            <path d={plama(s.x, s.y, 11, i * 2.3 + p)} fill={i % 2 ? "#ecd285" : "#d7dcb5"} />
            {i % 2 ? null : <circle cx={r2(s.x + 2)} cy={s.y} r="1.6" fill="#6f8a6a" opacity="0.6" />}
          </g>
        ))}

      {dodatki.includes("tartufo") &&
        pierscien(10, 52, 0.2 + p).map((s, i) => (
          <g key={`t-${i}`} transform={`rotate(${i * 37} ${s.x} ${s.y})`}>
            <ellipse cx={s.x} cy={s.y} rx="7" ry="4" fill="#3d3128" />
            <path d={`M${r2(s.x - 4)} ${s.y} q2 -2 4 0 t4 0`} stroke="#8a7560" strokeWidth="0.9" fill="none" />
          </g>
        ))}

      {dodatki.includes("basilico") &&
        pierscien(6, 58, 0.65 + p).map((s, i) => (
          <g key={`ba-${i}`} transform={`rotate(${i * 59} ${s.x} ${s.y})`}>
            <path
              d={`M ${s.x} ${s.y - 11} C ${s.x + 10} ${s.y - 5}, ${s.x + 9} ${s.y + 6}, ${s.x} ${s.y + 11} C ${s.x - 9} ${s.y + 6}, ${s.x - 10} ${s.y - 5}, ${s.x} ${s.y - 11} Z`}
              fill={url("leaf")}
            />
            <line x1={s.x} y1={s.y - 10} x2={s.x} y2={s.y + 10} stroke="#24541d" strokeWidth="1.1" />
            <path d={`M${r2(s.x - 3)} ${r2(s.y - 6)} q-1 4 0 7`} stroke="#fff" strokeOpacity="0.35" strokeWidth="1.3" fill="none" strokeLinecap="round" />
          </g>
        ))}

      {/* kropelki oliwy i światło padające z lewej góry — pizza przestaje być płaska */}
      {pierscien(5, 40, 2.1 + p).map((s, i) => (
        <ellipse key={`ol-${i}`} cx={s.x} cy={s.y} rx={2.2 - (i % 2) * 0.8} ry={1.3} fill="#fff6c8" opacity="0.5" />
      ))}
      <circle cx="100" cy="100" r="95" fill={url("light")} />
    </svg>
  );
}

/** Zestawy dodatków dla pozycji z karty. */
export const ART: Record<string, PizzaArtProps> = {
  margherita: { dodatki: ["basilico"], ziarno: 0 },
  marinara: { dodatki: ["olive"], sos: true, ziarno: 1 },
  diavola: { dodatki: ["salame"], ziarno: 2 },
  bufalina: { dodatki: ["bufala", "basilico"], ziarno: 3 },
  quattro: { dodatki: ["formaggi"], sos: false, ziarno: 4 },
  tartufo: { dodatki: ["tartufo", "funghi"], sos: false, ziarno: 5 },
  capricciosa: { dodatki: ["funghi", "olive"], ziarno: 6 },
  funghi: { dodatki: ["funghi"], ziarno: 7 },
  nduja: { dodatki: ["salame", "bufala"], ziarno: 8 },
  mortadella: { dodatki: ["formaggi", "basilico"], sos: false, ziarno: 9 },
};
