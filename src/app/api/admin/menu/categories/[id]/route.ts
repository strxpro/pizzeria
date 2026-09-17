import { NextResponse, type NextRequest } from "next/server";
import { deleteCategory, MenuError, updateCategory } from "@/lib/server/menu";
import { kitchenAllowed } from "@/lib/server/orders";

type Ctx = { params: Promise<{ id: string }> };

const fail = (e: unknown) => {
  if (e instanceof MenuError) return NextResponse.json({ error: e.message }, { status: e.status });
  throw e;
};

/** Zmiana nazwy (`label`) albo kolejności (`move: -1 | 1`) kategorii. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!kitchenAllowed(req)) return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  try {
    const body = (await req.json().catch(() => ({}))) as { label?: unknown; move?: unknown };
    return NextResponse.json({ category: await updateCategory((await params).id, body) });
  } catch (e) {
    return fail(e);
  }
}

/** Usuwa pustą kategorię. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!kitchenAllowed(req)) return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  try {
    await deleteCategory((await params).id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
