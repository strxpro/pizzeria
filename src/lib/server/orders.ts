import { randomBytes, timingSafeEqual } from "node:crypto";
import { FINAL_STATUSES, ORDER_FLOW, RESTAURANT, ZONES, type Mode, type OrderStatus } from "../data";
import { isPaused, openState } from "../format";
import { isLatLng, zoneFor, type LatLng } from "../geo";
import { dictFor, isLang } from "../i18n";
import type { Order } from "../order-types";
import { notify } from "./email";
import { pushNewOrder } from "./pushover";
import { jsonStore } from "./json-store";
import { orderableItems } from "./menu";
import { getSettings } from "./settings";

/**
 * Magazyn zamówień w pliku `.data/orders.json`.
 *
 * Wystarcza na jeden serwer Node (dev, VPS). Na hostingu bez trwałego dysku
 * (np. Vercel) trzeba to podmienić na bazę — interfejs zostaje ten sam.
 */

const raw = jsonStore<Record<string, Order>>("orders.json", () => ({}));

/** Etapy sprzed uproszczenia do trzech kroków → nowe odpowiedniki. */
const LEGACY: Record<string, OrderStatus> = { in_preparazione: "accettato", in_forno: "accettato", in_consegna: "in_viaggio" };

/** Starsze zapisy: dawne etapy i brak metody płatności. Zmienia obiekty w miejscu. */
function upgrade(db: Record<string, Order>) {
  for (const o of Object.values(db)) {
    o.status = LEGACY[o.status] ?? o.status;
    o.history = o.history
      .map((h) => ({ ...h, status: LEGACY[h.status] ?? h.status }))
      .filter((h, i, all) => i === 0 || all[i - 1].status !== h.status);
    o.paymentMethod ??= "cash";
  }
  return db;
}

const store = {
  read: async () => upgrade(await raw.read()),
  mutate: <R>(fn: (db: Record<string, Order>) => R | Promise<R>) => raw.mutate((db) => fn(upgrade(db))),
};

export class OrderError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export const normalizeEmail = (v: unknown) => str(v, 120).toLowerCase();
export const isEmail = (v: string) => EMAIL_RE.test(v);

export async function createOrder(input: unknown, origin: string): Promise<Order> {
  const body = (input ?? {}) as Record<string, unknown>;
  const lang = isLang(body.lang) ? body.lang : "it";
  const e = dictFor(lang).errors;
  const settings = await getSettings();
  if (isPaused(settings)) throw new OrderError(e.paused, 409);

  const mode: Mode = body.mode === "ritiro" ? "ritiro" : "domicilio";
  const name = str(body.name, 60);
  const phone = str(body.phone, 30);
  const email = normalizeEmail(body.email);
  const notes = str(body.notes, 300);
  const address = str(body.address, 160);
  const paymentMethod = body.paymentMethod === "card" ? "card" : "cash";

  if (name.length < 2) throw new OrderError(e.name);
  if (!/^[+\d][\d\s/-]{6,}$/.test(phone)) throw new OrderError(e.phone);
  if (!isEmail(email)) throw new OrderError(e.email);

  // Ceny zawsze z serwera — z przeglądarki bierzemy tylko identyfikatory i ilości.
  const rawLines = Array.isArray(body.lines) ? body.lines.slice(0, 40) : [];
  const menuItems = await orderableItems();
  const lines = rawLines.flatMap((l) => {
    const item = menuItems.find((i) => i.id === (l as { id?: unknown })?.id);
    const qty = Number((l as { qty?: unknown })?.qty);
    if (!item || !Number.isInteger(qty) || qty < 1 || qty > 20) return [];
    return [{ id: item.id, name: item.name, qty, price: item.price }];
  });
  if (!lines.length) throw new OrderError(e.empty);
  const subtotal = round(lines.reduce((n, l) => n + l.qty * l.price, 0));

  let location: LatLng | null = null;
  let zone = null;
  if (mode === "domicilio") {
    if (address.length < 5) throw new OrderError(e.address);
    if (isLatLng(body.location)) {
      location = { lat: round(body.location.lat, 5), lng: round(body.location.lng, 5) };
      // Z pozycji strefę liczymy sami — nie ufamy wyborowi z formularza.
      zone = zoneFor(location).zone;
      if (!zone) throw new OrderError(e.outOfZone);
    } else {
      zone = ZONES.find((z) => z.id === body.zoneId) ?? null;
      if (!zone) throw new OrderError(e.zone);
    }
    if (subtotal < zone.minimum) throw new OrderError(e.minimum(zone.name, zone.minimum));
  }

  const deliveryFee = zone && subtotal < RESTAURANT.freeDeliveryFrom ? zone.fee : 0;
  const now = new Date().toISOString();

  const order: Order = {
    id: randomBytes(9).toString("base64url"),
    createdAt: now,
    mode,
    status: "ricevuto",
    history: [{ status: "ricevuto", at: now }],
    customer: { name, phone, email },
    address: mode === "domicilio" ? address : null,
    location,
    zoneId: zone?.id ?? null,
    zoneName: zone?.name ?? null,
    travelMinutes: zone?.minutes ?? 0,
    lines,
    subtotal,
    deliveryFee,
    total: round(subtotal + deliveryFee),
    paymentMethod,
    notes,
    placedWhileClosed: !openState(new Date(), settings).open,
    lang,
    rejectReason: null,
    emails: [],
  };

  await store.mutate((db) => {
    db[order.id] = order;
  });
  // powiadomienie na telefon lokalu i e-mail do klienta idą równolegle
  const [log] = await Promise.all([notify(order, "ricevuto", origin), pushNewOrder(order, origin)]);
  await logEmail(order.id, log);
  return order;
}

async function logEmail(id: string, log: Order["emails"][number] | null) {
  if (!log) return;
  await store.mutate((db) => {
    db[id]?.emails.push(log);
  });
}

export async function getOrder(id: string) {
  if (!/^[\w-]{8,32}$/.test(id)) return null;
  return (await store.read())[id] ?? null;
}

export async function listOrders(limit = 80) {
  return Object.values(await store.read())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

/** Wszystkie zamówienia klienta (po zweryfikowanym e-mailu), najnowsze pierwsze. */
export async function listOrdersByEmail(email: string) {
  return Object.values(await store.read())
    .filter((o) => o.customer.email === email)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type Customer = {
  key: string;
  name: string;
  phone: string;
  email: string;
  orders: number;
  spent: number;
  lastOrderAt: string;
  lastAddress: string | null;
  rejected: number;
};

/** Klienci zebrani ze wszystkich zamówień (po e-mailu, a bez niego po telefonie). */
export async function listCustomers(): Promise<Customer[]> {
  const byKey = new Map<string, Customer>();
  const all = Object.values(await store.read()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const o of all) {
    const key = o.customer.email || o.customer.phone.replace(/\s/g, "");
    const c = byKey.get(key) ?? { key, name: o.customer.name, phone: o.customer.phone, email: o.customer.email, orders: 0, spent: 0, lastOrderAt: o.createdAt, lastAddress: null, rejected: 0 };
    c.name = o.customer.name;
    c.phone = o.customer.phone;
    c.lastOrderAt = o.createdAt;
    if (o.address) c.lastAddress = o.address;
    if (o.status === "rifiutato") c.rejected += 1;
    else {
      c.orders += 1;
      c.spent = Math.round((c.spent + o.total) * 100) / 100;
    }
    byKey.set(key, c);
  }
  return [...byKey.values()].sort((a, b) => b.lastOrderAt.localeCompare(a.lastOrderAt));
}

/** Przesuwa zamówienie o jeden etap dalej i wysyła powiadomienie. */
export async function advanceOrder(id: string, to: OrderStatus, origin: string) {
  const order = await store.mutate((db) => {
    const o = db[id];
    if (!o) throw new OrderError("Ordine non trovato.", 404);
    const flow = ORDER_FLOW[o.mode] as readonly OrderStatus[];
    const next = flow[flow.indexOf(o.status) + 1];
    if (to !== next) throw new OrderError("Passaggio non valido.", 409);
    o.status = to;
    o.history.push({ status: to, at: new Date().toISOString() });
    return structuredClone(o);
  });
  await logEmail(id, await notify(order, to, origin));
  return order;
}

/** Pozycja kierowcy z telefonu w panelu admina — tylko dla zamówienia w drodze. */
export async function setRiderPosition(id: string, point: unknown) {
  if (!isLatLng(point)) throw new OrderError("Posizione non valida.", 400);
  return store.mutate((db) => {
    const o = db[id];
    if (!o) throw new OrderError("Ordine non trovato.", 404);
    if (o.status !== "in_viaggio") throw new OrderError("L'ordine non è in viaggio.", 409);
    o.rider = { lat: round(point.lat, 5), lng: round(point.lng, 5), at: new Date().toISOString() };
    return o.rider;
  });
}

/** Lokal odrzuca zamówienie (np. brak składników, poza godzinami) — klient dostaje e-mail z powodem. */
export async function rejectOrder(id: string, reason: unknown, origin: string) {
  const order = await store.mutate((db) => {
    const o = db[id];
    if (!o) throw new OrderError("Ordine non trovato.", 404);
    if (FINAL_STATUSES.includes(o.status) || o.status === "in_viaggio" || o.status === "pronto") {
      throw new OrderError("L'ordine non si può più annullare.", 409);
    }
    o.status = "rifiutato";
    o.rejectReason = str(reason, 200) || null;
    o.history.push({ status: "rifiutato", at: new Date().toISOString() });
    return structuredClone(o);
  });
  await logEmail(id, await notify(order, "rifiutato", origin));
  return order;
}

/** Cofnięcie pomyłkowego anulowania: zamówienie wraca do etapu sprzed odrzucenia, klient dostaje e-mail. */
export async function restoreOrder(id: string, origin: string) {
  const order = await store.mutate((db) => {
    const o = db[id];
    if (!o) throw new OrderError("Ordine non trovato.", 404);
    if (o.status !== "rifiutato") throw new OrderError("L'ordine non è annullato.", 409);
    const previous = [...o.history].reverse().find((h) => h.status !== "rifiutato")?.status ?? "ricevuto";
    o.status = previous;
    o.rejectReason = null;
    o.history.push({ status: previous, at: new Date().toISOString() });
    return structuredClone(o);
  });
  await logEmail(id, await notify(order, order.status, origin));
  return order;
}

/**
 * Dostęp do panelu admina. W produkcji wymagany `KITCHEN_KEY`;
 * lokalnie bez klucza panel jest otwarty, żeby dało się przetestować śledzenie.
 */
export function kitchenAllowed(req: Request) {
  const expected = process.env.KITCHEN_KEY;
  if (!expected) return process.env.NODE_ENV !== "production";
  const given = req.headers.get("x-kitchen-key") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Prosty limit: najwyżej 5 zamówień z jednego adresu w 10 minut. */
const hits = new Map<string, number[]>();
export function rateLimited(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 5;
}

function round(n: number, digits = 2) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
