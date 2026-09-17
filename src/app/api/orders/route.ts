import { NextResponse, type NextRequest } from "next/server";
import { toPublic } from "@/lib/order-types";
import { createOrder, kitchenAllowed, listOrders, OrderError, rateLimited } from "@/lib/server/orders";
import { pushoverConfigured } from "@/lib/server/pushover";
import { SESSION_COOKIE, sessionEmail } from "@/lib/server/customer";
import { dictFor, isLang } from "@/lib/i18n";
import { normalizeEmail } from "@/lib/server/orders";

/** Nowe zamówienie od klienta. */
export async function POST(req: NextRequest) {
  if (rateLimited(req)) {
    return NextResponse.json({ error: "Troppi ordini in poco tempo. Chiamaci!" }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
  }
  // Zamówić może tylko ktoś, kto potwierdził e-mail kodem (ciasteczko sesji z tym samym adresem).
  const { email, lang } = (body ?? {}) as { email?: unknown; lang?: unknown };
  const verified = await sessionEmail(req.cookies.get(SESSION_COOKIE)?.value);
  if (!verified || verified !== normalizeEmail(email)) {
    const t = dictFor(isLang(lang) ? lang : "it");
    return NextResponse.json({ error: t.errors.verifyEmail, needsVerify: true }, { status: 401 });
  }

  try {
    const order = await createOrder(body, req.nextUrl.origin);
    return NextResponse.json({ order: toPublic(order) }, { status: 201 });
  } catch (e) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Qualcosa è andato storto. Chiamaci!" }, { status: 500 });
  }
}

/** Lista dla panelu kuchni — pełne dane, więc tylko z kluczem. */
export async function GET(req: NextRequest) {
  if (!kitchenAllowed(req)) return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  return NextResponse.json({ orders: await listOrders(), pushover: pushoverConfigured() });
}
