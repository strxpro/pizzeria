import { type NextRequest } from "next/server";
import { readPhoto } from "@/lib/server/uploads";

/** Zdjęcie z opinii. Nazwa jest losowa; na stronie publikujemy tylko zdjęcia zatwierdzone w panelu. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const photo = await readPhoto((await params).name);
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(photo.bytes), {
    headers: { "Content-Type": photo.mime, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
