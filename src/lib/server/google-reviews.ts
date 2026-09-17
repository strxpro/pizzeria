import { RESTAURANT } from "@/lib/data";

/**
 * Opinie z wizytówki Google (Places API — nowa wersja), do pokazania w talii obok opinii ze strony.
 *
 * Ograniczenia Google, których nie da się obejść:
 * - API zwraca najwyżej 5 opinii wybranych przez Google (najbardziej „przydatne”), nie wszystkie;
 * - opinii NIE da się dodać do Google przez API — klient musi napisać ją sam na wizytówce;
 * - przy każdej opinii trzeba pokazać autora i oznaczenie, że pochodzi z Google.
 *
 * Na stronie pokazujemy tylko 4–5★ z tekstem. Średnia na stronie ich nie liczy (to osobne źródło).
 * Wymaga `GOOGLE_PLACES_API_KEY` i identyfikatora miejsca (`GOOGLE_PLACE_ID` albo `RESTAURANT.googlePlaceId`).
 * Wynik trzymamy w pamięci 6 godzin, żeby nie płacić za każde wejście na stronę.
 */
export type GoogleReview = { id: string; rating: number; text: string; author: string; authorUrl: string | null; when: string };

const TTL = 6 * 60 * 60_000;
const cache = new Map<string, { at: number; items: GoogleReview[] }>();

type PlacesResponse = {
  reviews?: {
    name?: string;
    rating?: number;
    text?: { text?: string };
    originalText?: { text?: string };
    authorAttribution?: { displayName?: string; uri?: string };
    relativePublishTimeDescription?: string;
  }[];
};

export async function googleReviews(lang: string): Promise<GoogleReview[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID || RESTAURANT.googlePlaceId;
  if (!key || !placeId) return [];

  const cached = cache.get(lang);
  if (cached && Date.now() - cached.at < TTL) return cached.items;

  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=${encodeURIComponent(lang)}`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "reviews" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`Places ${res.status}`);
    const data = (await res.json()) as PlacesResponse;
    const items = (data.reviews ?? [])
      .map((r, i) => ({
        id: r.name ?? `google-${i}`,
        rating: r.rating ?? 0,
        text: (r.text?.text ?? r.originalText?.text ?? "").trim(),
        author: r.authorAttribution?.displayName ?? "Google",
        authorUrl: r.authorAttribution?.uri ?? null,
        when: r.relativePublishTimeDescription ?? "",
      }))
      .filter((r) => r.rating >= 4 && r.text.length >= 8);
    cache.set(lang, { at: Date.now(), items });
    return items;
  } catch (e) {
    console.error("Google reviews:", e);
    // po błędzie nie pytamy Google przy każdym wejściu — spróbujemy za godzinę
    cache.set(lang, { at: Date.now() - TTL + 60 * 60_000, items: cached?.items ?? [] });
    return cached?.items ?? [];
  }
}
