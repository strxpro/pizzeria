import { NextResponse, type NextRequest } from "next/server";
import { kitchenAllowed } from "@/lib/server/orders";
import { saveHours, setPause, SettingsError } from "@/lib/server/settings";

/** `{ hours: [...] }` zapisuje godziny, `{ pause: "hour" | "today" | "until" | "resume" }` zamyka/otwiera lokal. */
export async function PATCH(req: NextRequest) {
  if (!kitchenAllowed(req)) return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { hours?: unknown; pause?: unknown };
  try {
    const settings = body.hours !== undefined ? await saveHours(body.hours) : await setPause(body.pause ?? "resume");
    return NextResponse.json(settings);
  } catch (e) {
    if (e instanceof SettingsError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
