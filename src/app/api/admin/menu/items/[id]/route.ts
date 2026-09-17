import { NextResponse, type NextRequest } from "next/server";
import { deleteItem, MenuError, moveItem, updateItem } from "@/lib/server/menu";
import { kitchenAllowed } from "@/lib/server/orders";
import { savePhoto } from "@/lib/server/uploads";

type Ctx = { params: Promise<{ id: string }> };

const fail = (e: unknown) => {
  if (e instanceof MenuError) return NextResponse.json({ error: e.message }, { status: e.status });
  throw e;
};

/**
 * Zmiana produktu: multipart z polami (i opcjonalnie nowym zdjęciem / `removePhoto=true`)
 * albo JSON `{ move: -1 | 1 }` (kolejność) lub `{ available: boolean }` (szybki przełącznik).
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!kitchenAllowed(req)) return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  const id = (await params).id;
  try {
    if (!req.headers.get("content-type")?.includes("multipart/form-data")) {
      const body = (await req.json().catch(() => ({}))) as { move?: number; available?: boolean };
      if (body.move) {
        await moveItem(id, body.move);
        return NextResponse.json({ ok: true });
      }
      return NextResponse.json({ item: await updateItem(id, { available: body.available }, null) });
    }
    const form = await req.formData();
    const file = form.get("photo");
    let photo: { set: string | null } | null = form.get("removePhoto") === "true" ? { set: null } : null;
    if (file instanceof File && file.size) {
      const saved = await savePhoto(file);
      if (!saved) return NextResponse.json({ error: "Foto non valida (JPG, PNG o WebP, max 3 MB)." }, { status: 400 });
      photo = { set: `/api/uploads/${saved}` };
    }
    const fields = Object.fromEntries([...form.entries()].filter(([k]) => k !== "photo" && k !== "removePhoto"));
    return NextResponse.json({ item: await updateItem(id, fields, photo) });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!kitchenAllowed(req)) return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  try {
    await deleteItem((await params).id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
