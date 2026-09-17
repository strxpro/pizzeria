import { NextResponse, type NextRequest } from "next/server";
import { kitchenAllowed, OrderError, setRiderPosition } from "@/lib/server/orders";

type Ctx = { params: Promise<{ id: string }> };

/** Telefon kierowcy (panel admina) co kilka sekund wysyła swoją pozycję — klient widzi ją na mapie. */
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!kitchenAllowed(req)) return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { lat?: number; lng?: number } | null;
  try {
    const rider = await setRiderPosition((await params).id, body);
    return NextResponse.json({ rider });
  } catch (e) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
