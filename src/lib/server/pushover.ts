import { RESTAURANT } from "@/lib/data";
import { euro } from "@/lib/format";
import type { Order } from "@/lib/order-types";

/**
 * Powiadomienie na telefon przez Pushover (https://pushover.net) przy nowym zamówieniu.
 * Wymaga `PUSHOVER_TOKEN` (token aplikacji) i `PUSHOVER_USER` (klucz użytkownika lub grupy).
 * Dźwięk: `PUSHOVER_SOUND` (domyślnie „cashregister”). Priorytet 1 przebija tryb cichy w aplikacji.
 * Błąd Pushovera nigdy nie blokuje przyjęcia zamówienia.
 */
export function pushoverConfigured() {
  return Boolean(process.env.PUSHOVER_TOKEN && process.env.PUSHOVER_USER);
}

export async function pushNewOrder(order: Order, origin: string) {
  if (!pushoverConfigured()) return false;
  const base = process.env.SITE_URL || origin;
  const items = order.lines.map((l) => `${l.qty}× ${l.name}`).join(", ");
  const where = order.mode === "domicilio" ? `Consegna: ${order.address ?? "—"} (${order.zoneName ?? ""})` : "Ritiro in pizzeria";

  try {
    const res = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: process.env.PUSHOVER_TOKEN,
        user: process.env.PUSHOVER_USER,
        title: `Nuovo ordine ${euro(order.total)} — ${order.customer.name}`,
        message: `${items}\n${where}\nTel. ${order.customer.phone}${order.notes ? `\nNote: ${order.notes}` : ""}`,
        url: `${base}/admin`,
        url_title: `Apri admin ${RESTAURANT.name}`,
        priority: 1,
        sound: process.env.PUSHOVER_SOUND || "cashregister",
        timestamp: Math.floor(Date.parse(order.createdAt) / 1000),
      }),
      signal: AbortSignal.timeout(6000),
    });
    return res.ok;
  } catch (e) {
    console.error("Pushover:", e);
    return false;
  }
}
