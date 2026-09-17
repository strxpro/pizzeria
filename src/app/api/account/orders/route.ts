import { NextResponse, type NextRequest } from "next/server";
import { toPublic } from "@/lib/order-types";
import { SESSION_COOKIE, sessionEmail } from "@/lib/server/customer";
import { feedbackByOrders } from "@/lib/server/feedback";
import { listOrdersByEmail } from "@/lib/server/orders";

/** Zamówienia zalogowanego klienta z jego opiniami. */
export async function GET(req: NextRequest) {
  const email = await sessionEmail(req.cookies.get(SESSION_COOKIE)?.value);
  if (!email) return NextResponse.json({ error: "login" }, { status: 401 });

  const orders = await listOrdersByEmail(email);
  const reviews = await feedbackByOrders(orders.map((o) => o.id));
  return NextResponse.json(
    {
      email,
      orders: orders.map((o) => {
        const r = reviews.find((f) => f.orderId === o.id);
        return { ...toPublic(o), review: r ? { rating: r.rating, text: r.text, createdAt: r.createdAt } : null };
      }),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
