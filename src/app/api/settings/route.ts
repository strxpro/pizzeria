import { NextResponse } from "next/server";
import { getSettings } from "@/lib/server/settings";

/** Godziny i pauza — strona odświeża je co minutę, żeby zamknięcie z panelu było widać od razu. */
export async function GET() {
  return NextResponse.json(await getSettings(), { headers: { "Cache-Control": "no-store" } });
}
