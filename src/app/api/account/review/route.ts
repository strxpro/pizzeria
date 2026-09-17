import { NextResponse, type NextRequest } from "next/server";
import { FINAL_STATUSES } from "@/lib/data";
import { dictFor, isLang } from "@/lib/i18n";
import { SESSION_COOKIE, sessionEmail } from "@/lib/server/customer";
import { addFeedback, FeedbackError } from "@/lib/server/feedback";
import { getOrder } from "@/lib/server/orders";

/** Opinia do konkretnego, własnego i zakończonego zamówienia (oznaczana jako zweryfikowana). */
export async function POST(req: NextRequest) {
  const body = ((await req.json().catch(() => ({}))) ?? {}) as { orderId?: string; lang?: string };
  const t = dictFor(isLang(body.lang) ? body.lang : "it");
  const email = await sessionEmail(req.cookies.get(SESSION_COOKIE)?.value);
  if (!email) return NextResponse.json({ error: t.errors.login }, { status: 401 });

  const order = body.orderId ? await getOrder(body.orderId) : null;
  if (!order || order.customer.email !== email) return NextResponse.json({ error: t.errors.login }, { status: 403 });
  if (!FINAL_STATUSES.includes(order.status) || order.status === "rifiutato") {
    return NextResponse.json({ error: t.errors.notDelivered }, { status: 409 });
  }

  try {
    const item = await addFeedback(body, { orderId: order.id, email, name: order.customer.name });
    return NextResponse.json({ published: item.published, route: item.route }, { status: 201 });
  } catch (e) {
    if (e instanceof FeedbackError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
