import { NextResponse, type NextRequest } from "next/server";
import { ORDER_FLOW, type OrderStatus } from "@/lib/data";
import { toPublic } from "@/lib/order-types";
import { advanceOrder, getOrder, kitchenAllowed, OrderError, rejectOrder, restoreOrder } from "@/lib/server/orders";

type Ctx = { params: Promise<{ id: string }> };

/** Stan zamówienia dla strony śledzenia. Identyfikator jest losowy i nie do zgadnięcia. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const order = await getOrder((await params).id);
  if (!order) return NextResponse.json({ error: "Ordine non trovato." }, { status: 404 });
  return NextResponse.json({ order: toPublic(order) }, { headers: { "Cache-Control": "no-store" } });
}

/** Admin przesuwa zamówienie na kolejny etap, odrzuca je (`status: "rifiutato"`, `reason`) albo cofa anulowanie (`action: "restore"`). */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!kitchenAllowed(req)) return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  const { status, reason, action } = (await req.json().catch(() => ({}))) as { status?: string; reason?: string; action?: string };
  if (action === "restore") {
    try {
      return NextResponse.json({ order: await restoreOrder((await params).id, req.nextUrl.origin) });
    } catch (e) {
      if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }
  }
  const known = new Set<string>([...ORDER_FLOW.domicilio, ...ORDER_FLOW.ritiro, "rifiutato"]);
  if (!status || !known.has(status)) return NextResponse.json({ error: "Stato non valido." }, { status: 400 });

  try {
    const id = (await params).id;
    const order =
      status === "rifiutato"
        ? await rejectOrder(id, reason, req.nextUrl.origin)
        : await advanceOrder(id, status as OrderStatus, req.nextUrl.origin);
    return NextResponse.json({ order });
  } catch (e) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
