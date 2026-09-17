import { NextResponse, type NextRequest } from "next/server";
import { isLang } from "@/lib/i18n";
import { AuthError, SESSION_COOKIE, verifyCode } from "@/lib/server/customer";
import { limiter } from "@/lib/server/json-store";
import { normalizeEmail } from "@/lib/server/orders";

const tooMany = limiter(20, 15 * 60_000);

/** Sprawdza kod i zakłada sesję w ciasteczku httpOnly. */
export async function POST(req: NextRequest) {
  if (tooMany(req)) return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  const body = ((await req.json().catch(() => ({}))) ?? {}) as { email?: string; code?: string; lang?: string };
  const lang = isLang(body.lang) ? body.lang : "it";
  const code = String(body.code ?? "").replace(/\D/g, "").slice(0, 6);

  try {
    const { token, maxAge } = await verifyCode(normalizeEmail(body.email), code, lang);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge,
    });
    return res;
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
