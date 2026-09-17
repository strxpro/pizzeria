import { NextResponse, type NextRequest } from "next/server";
import { addReaction, FeedbackError, getReactions } from "@/lib/server/feedback";
import { limiter } from "@/lib/server/json-store";

const tooMany = limiter(30, 60_000);

/** Liczniki szybkich reakcji (❤️ 😋 🤪) widoczne dla wszystkich. */
export async function GET() {
  return NextResponse.json({ reactions: await getReactions() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  if (tooMany(req)) return NextResponse.json({ error: "Calma! 🙂" }, { status: 429 });
  const { kind } = ((await req.json().catch(() => ({}))) ?? {}) as { kind?: string };
  try {
    return NextResponse.json({ reactions: await addReaction(kind ?? "") });
  } catch (e) {
    if (e instanceof FeedbackError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
