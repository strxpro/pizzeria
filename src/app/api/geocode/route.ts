import { NextResponse, type NextRequest } from "next/server";
import { RESTAURANT } from "@/lib/data";

/**
 * Współrzędne → adres (OpenStreetMap Nominatim). Idzie przez serwer, bo regulamin
 * Nominatim wymaga identyfikującego nagłówka User-Agent. Przy większym ruchu
 * podmienić na płatnego dostawcę geokodowania.
 */
export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "Coordinate non valide." }, { status: 400 });
  }

  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.search = new URLSearchParams({
    format: "jsonv2",
    lat: lat.toFixed(5),
    lon: lng.toFixed(5),
    zoom: "18",
    addressdetails: "1",
    "accept-language": "it",
  }).toString();

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": `${RESTAURANT.name}-sito/1.0 (${RESTAURANT.email})` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { address?: Record<string, string> };
    const a = data.address ?? {};
    const street = [a.road ?? a.pedestrian ?? a.footway, a.house_number].filter(Boolean).join(" ");
    const city = a.city ?? a.town ?? a.village ?? "";
    return NextResponse.json({ address: [street, city].filter(Boolean).join(", ") || null });
  } catch {
    // Brak adresu nie blokuje zamówienia — klient wpisze go ręcznie.
    return NextResponse.json({ address: null });
  }
}
