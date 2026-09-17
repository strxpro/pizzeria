import { NextResponse, type NextRequest } from "next/server";
import { adminMenu, createCategory, createItem, MenuError } from "@/lib/server/menu";
import { kitchenAllowed } from "@/lib/server/orders";
import { savePhoto } from "@/lib/server/uploads";

const fail = (e: unknown) => {
  if (e instanceof MenuError) return NextResponse.json({ error: e.message }, { status: e.status });
  throw e;
};

/** Pełne menu dla panelu (także niedostępne pozycje). */
export async function GET(req: NextRequest) {
  if (!kitchenAllowed(req)) return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  return NextResponse.json(await adminMenu(), { headers: { "Cache-Control": "no-store" } });
}

/** Nowy produkt (multipart ze zdjęciem) albo nowa kategoria (JSON `{ category: "Nazwa" }`). */
export async function POST(req: NextRequest) {
  if (!kitchenAllowed(req)) return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  try {
    if (!req.headers.get("content-type")?.includes("multipart/form-data")) {
      const body = (await req.json().catch(() => ({}))) as { category?: unknown };
      return NextResponse.json({ category: await createCategory(body.category) }, { status: 201 });
    }
    const form = await req.formData();
    const file = form.get("photo");
    let photo: string | null = null;
    if (file instanceof File && file.size) {
      const saved = await savePhoto(file);
      if (!saved) return NextResponse.json({ error: "Foto non valida (JPG, PNG o WebP, max 3 MB)." }, { status: 400 });
      photo = `/api/uploads/${saved}`;
    }
    const item = await createItem(Object.fromEntries(form.entries()), photo);
    return NextResponse.json({ item }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
