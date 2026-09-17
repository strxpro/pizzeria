import { NextResponse, type NextRequest } from "next/server";
import { dictFor, isLang } from "@/lib/i18n";
import { AuthError, requestCode } from "@/lib/server/customer";
import { limiter } from "@/lib/server/json-store";
import { isEmail, normalizeEmail } from "@/lib/server/orders";

const tooMany = limiter(8, 15 * 60_000);

/** Wysyła kod logowania. Odpowiedź nie zdradza, czy e-mail ma zamówienia. */
export async function POST(req: NextRequest) {
  const body = ((await req.json().catch(() => ({}))) ?? {}) as { email?: string; lang?: string };
  const lang = isLang(body.lang) ? body.lang : "it";
  const t = dictFor(lang);
  if (tooMany(req)) return NextResponse.json({ error: t.common.tooMany }, { status: 429 });

  const email = normalizeEmail(body.email);
  if (!isEmail(email)) return NextResponse.json({ error: t.errors.email }, { status: 400 });

  try {
    const { devCode } = await requestCode(email, lang);
    return NextResponse.json({ ok: true, devCode });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
