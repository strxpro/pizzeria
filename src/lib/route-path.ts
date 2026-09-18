import { PIZZERIA, type LatLng } from "./geo";

type Pt = [number, number];

/**
 * Trasa kuriera przygotowana do animacji: punkty [lat, lng], narastająca odległość do każdego
 * punktu (żeby skuter jechał równo, a nie skakał po nierównych odcinkach) i nazwy ulic.
 * `real` — trasa z prawdziwych ulic (OSRM); `false` — zapasowy łuk, gdy serwer tras nie odpowie.
 */
export type RoutePath = {
  points: Pt[];
  cum: number[];
  total: number;
  steps: { name: string; at: number }[];
  km: number;
  minutes: number;
  real: boolean;
};

/** Punkt na łuku między pizzerią a celem — zapasowa „trasa”, gdy nie ma prawdziwej. */
export function curvePoint(a: LatLng, b: LatLng, t: number): Pt {
  const c = { lat: (a.lat + b.lat) / 2 - (b.lng - a.lng) * 0.25, lng: (a.lng + b.lng) / 2 + (b.lat - a.lat) * 0.25 };
  const u = 1 - t;
  return [u * u * a.lat + 2 * u * t * c.lat + t * t * b.lat, u * u * a.lng + 2 * u * t * c.lng + t * t * b.lng];
}

function build(points: Pt[], steps: RoutePath["steps"], km: number, minutes: number, real: boolean): RoutePath {
  // odległości „płaskie” (w stopniach, z poprawką na szerokość) — do równego tempa wystarczą
  const k = Math.cos((points[0][0] * Math.PI) / 180);
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    const dLat = points[i][0] - points[i - 1][0];
    const dLng = (points[i][1] - points[i - 1][1]) * k;
    cum.push(cum[i - 1] + Math.hypot(dLat, dLng));
  }
  return { points, cum, total: cum.at(-1) || 1, steps, km, minutes, real };
}

const cache = new Map<string, Promise<RoutePath>>();

/** Trasa z pizzerii do `to` — z serwera (prawdziwe ulice), a gdy się nie uda, łuk. */
export function loadRoute(to: LatLng): Promise<RoutePath> {
  const key = `${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = fetch(`/api/route?lat=${to.lat}&lng=${to.lng}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { points: Pt[]; steps: RoutePath["steps"]; km: number; minutes: number }) => {
        if (d.points.length < 2) throw new Error("empty");
        return build(d.points, d.steps, d.km, d.minutes, true);
      })
      .catch(() => {
        cache.delete(key);
        return build(
          Array.from({ length: 33 }, (_, i) => curvePoint(PIZZERIA, to, i / 32)),
          [],
          0,
          0,
          false,
        );
      });
    cache.set(key, hit);
  }
  return hit;
}

/** Indeks odcinka, na którym leży postęp `t` (0–1). */
function segment(path: RoutePath, t: number) {
  const d = Math.min(1, Math.max(0, t)) * path.total;
  let lo = 0;
  let hi = path.cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (path.cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const span = path.cum[hi] - path.cum[lo] || 1;
  return { i: lo, f: (d - path.cum[lo]) / span };
}

/** Pozycja na trasie przy postępie `t` (0 = pizzeria, 1 = cel). */
export function pointAt(path: RoutePath, t: number): Pt {
  const { i, f } = segment(path, t);
  const a = path.points[i];
  const b = path.points[Math.min(i + 1, path.points.length - 1)];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

/** Przejechana część trasy — do pogrubienia linii za skuterem. */
export function pathUntil(path: RoutePath, t: number): Pt[] {
  const { i } = segment(path, t);
  return [...path.points.slice(0, i + 1), pointAt(path, t)];
}

/** Ulica, którą kurier jedzie przy postępie `t`. */
export function streetAt(path: RoutePath, t: number): string | null {
  let name: string | null = null;
  for (const s of path.steps) {
    if (s.at <= t) name = s.name;
    else break;
  }
  return name;
}
