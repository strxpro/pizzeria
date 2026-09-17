import { NextResponse, type NextRequest } from "next/server";
import { updateFeedback, type FeedbackAction } from "@/lib/server/feedback";
import { kitchenAllowed } from "@/lib/server/orders";

/** Admin: obsłużona / opublikuj / ukryj ze strony / pokaż albo ukryj zdjęcia. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!kitchenAllowed(req)) return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  const { action } = ((await req.json().catch(() => ({}))) ?? {}) as { action?: string };
  const allowed: FeedbackAction[] = ["publish", "unpublish", "photosOn", "photosOff"];
  const a: FeedbackAction = allowed.includes(action as FeedbackAction) ? (action as FeedbackAction) : "handled";
  const item = await updateFeedback((await params).id, a);
  if (!item) return NextResponse.json({ error: "Non trovato." }, { status: 404 });
  return NextResponse.json({ item });
}
