import { NextResponse, type NextRequest } from "next/server";
import { kitchenAllowed, listCustomers } from "@/lib/server/orders";

/** Lista klientów dla panelu admina — dane kontaktowe, więc tylko z kluczem. */
export async function GET(req: NextRequest) {
  if (!kitchenAllowed(req)) return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  return NextResponse.json({ customers: await listCustomers() }, { headers: { "Cache-Control": "no-store" } });
}
