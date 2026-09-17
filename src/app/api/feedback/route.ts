import { NextResponse, type NextRequest } from "next/server";
import { limiter } from "@/lib/server/json-store";
import { addFeedback, FeedbackError, listFeedback } from "@/lib/server/feedback";
import { MAX_PHOTOS, savePhoto } from "@/lib/server/uploads";
import { kitchenAllowed } from "@/lib/server/orders";

const tooMany = limiter(5, 10 * 60_000);

/** Nowa opinia z formularza na stronie (JSON albo multipart ze zdjęciami). */
export async function POST(req: NextRequest) {
  if (tooMany(req)) return NextResponse.json({ error: "Troppi invii, riprova più tardi." }, { status: 429 });
  try {
    let body: Record<string, unknown> | null;
    const photos: string[] = [];
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await req.formData();
      body = { rating: form.get("rating"), text: form.get("text"), name: form.get("name"), email: form.get("email"), lang: form.get("lang") };
      for (const file of form.getAll("photos").slice(0, MAX_PHOTOS)) {
        if (file instanceof File && file.size) {
          const saved = await savePhoto(file);
          if (saved) photos.push(saved);
        }
      }
    } else {
      body = await req.json().catch(() => null);
    }
    const item = await addFeedback(body, { photos });
    return NextResponse.json({ route: item.route }, { status: 201 });
  } catch (e) {
    if (e instanceof FeedbackError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

/** Lista i statystyki dla panelu admina. */
export async function GET(req: NextRequest) {
  if (!kitchenAllowed(req)) return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  return NextResponse.json(await listFeedback(), { headers: { "Cache-Control": "no-store" } });
}
