import { NextResponse, type NextRequest } from "next/server";
import { isLang } from "@/lib/i18n";
import { googleReviews } from "@/lib/server/google-reviews";

/** Dobre opinie z wizytówki Google (4–5★) — pusta lista, gdy klucz API nie jest ustawiony. */
export async function GET(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get("lang");
  const items = await googleReviews(isLang(lang) ? lang : "it");
  return NextResponse.json({ items }, { headers: { "Cache-Control": "public, max-age=600" } });
}
