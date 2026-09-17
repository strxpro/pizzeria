import { NextResponse } from "next/server";
import { publicFeedback } from "@/lib/server/feedback";

/** Opublikowane opinie do talii na stronie + średnia ze wszystkich ocen. */
export async function GET() {
  return NextResponse.json(await publicFeedback(), { headers: { "Cache-Control": "no-store" } });
}
