import { NextResponse, type NextRequest } from "next/server";
import { RESTAURANT } from "@/lib/data";
import { distanceKm, PIZZERIA } from "@/lib/geo";

/**
 * Trasa po prawdziwych ulicach z pizzerii do punktu (darmowy OSRM na danych OpenStreetMap).
 * Idzie przez serwer: wynik trafia do pamięci podręcznej (ten sam adres = jedno zapytanie),
 * a publiczny serwer OSRM dostaje identyfikujący nagłówek, jak prosi jego regulamin.
 * Przy większym ruchu podmienić na własny OSRM albo płatnego dostawcę tras.
 *
 * Odpowiedź: `points` — [lat, lng] wzdłuż trasy; `steps` — nazwy ulic z miejscem (0–1),
 * w którym kurier w nie skręca; `km` i `minutes` — długość i czas jazdy.
 */
export type RouteResponse = {
  points: [number, number][];
  steps: { name: string; at: number }[];
  km: number;
  minutes: number;
};

const cache = new Map<string, { at: number; data: RouteResponse }>();
const DAY = 24 * 60 * 60 * 1000;
/** Dalej nie dowozimy — chroni też publiczny serwer tras przed przypadkowymi zapytaniami. */
const MAX_KM = 30;

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || distanceKm(PIZZERIA, { lat, lng }) > MAX_KM) {
    return NextResponse.json({ error: "Punto fuori zona." }, { status: 400 });
  }

  // ~10 m dokładności wystarczy — i ten sam dom trafia w tę samą pozycję pamięci
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < DAY) return NextResponse.json(hit.data, { headers: { "Cache-Control": "public, max-age=86400" } });

  const url = `https://router.project-osrm.org/route/v1/driving/${PIZZERIA.lng},${PIZZERIA.lat};${lng.toFixed(5)},${lat.toFixed(5)}?overview=full&geometries=geojson&steps=true`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": `${RESTAURANT.name}-sito/1.0 (${RESTAURANT.email})` },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const json = (await res.json()) as {
      routes?: {
        distance: number;
        duration: number;
        geometry: { coordinates: [number, number][] };
        legs: { steps: { name: string; distance: number }[] }[];
      }[];
    };
    const route = json.routes?.[0];
    if (!route) throw new Error("no route");

    // skręty: miejsce na trasie liczone z sumy długości poprzednich odcinków
    const steps: RouteResponse["steps"] = [];
    let walked = 0;
    for (const s of route.legs[0]?.steps ?? []) {
      if (s.name && steps.at(-1)?.name !== s.name) steps.push({ name: s.name, at: Math.min(1, walked / route.distance) });
      walked += s.distance;
    }

    const data: RouteResponse = {
      points: route.geometry.coordinates.map(([x, y]) => [Number(y.toFixed(5)), Number(x.toFixed(5))]),
      steps,
      km: Math.round(route.distance / 100) / 10,
      // skuter w mieście jedzie mniej więcej jak samochód z OSRM — zaokrąglamy w górę
      minutes: Math.max(1, Math.ceil(route.duration / 60)),
    };
    cache.set(key, { at: Date.now(), data });
    return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=86400" } });
  } catch {
    // brak trasy nie psuje strony — mapa narysuje wtedy łuk
    return NextResponse.json({ error: "Percorso non disponibile." }, { status: 502 });
  }
}
