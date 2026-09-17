import { RESTAURANT, ZONES, type Zone } from "./data";

export type LatLng = { lat: number; lng: number };

/** Odległość w linii prostej (wzór haversine), w kilometrach. */
export function distanceKm(a: LatLng, b: LatLng) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export const PIZZERIA: LatLng = { lat: RESTAURANT.lat, lng: RESTAURANT.lng };

/** Strefa dla punktu albo `null`, gdy jest poza zasięgiem dostaw. */
export function zoneFor(point: LatLng): { zone: Zone | null; km: number } {
  const km = distanceKm(PIZZERIA, point);
  return { zone: ZONES.find((z) => km <= z.maxKm) ?? null, km };
}

export const isLatLng = (v: unknown): v is LatLng =>
  !!v &&
  typeof v === "object" &&
  Number.isFinite((v as LatLng).lat) &&
  Number.isFinite((v as LatLng).lng) &&
  Math.abs((v as LatLng).lat) <= 90 &&
  Math.abs((v as LatLng).lng) <= 180;
