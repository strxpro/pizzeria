import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionEmail } from "@/lib/server/customer";

/** Czy przeglądarka ma już potwierdzony e-mail (ciasteczko sesji) — bez zdradzania czegokolwiek więcej. */
export async function GET(req: NextRequest) {
  const email = await sessionEmail(req.cookies.get(SESSION_COOKIE)?.value);
  return NextResponse.json({ email: email ?? null }, { headers: { "Cache-Control": "no-store" } });
}
