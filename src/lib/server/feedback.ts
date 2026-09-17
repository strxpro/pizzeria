import { randomBytes } from "node:crypto";
import { RESTAURANT } from "../data";
import { dictFor, isLang, type Lang } from "../i18n";
import { esc, layout, sendMail } from "./email";
import { jsonStore } from "./json-store";

/**
 * Opinie wysłane formularzem na stronie albo z „Moich zamówień”.
 *
 * - wszystkie trafiają do panelu admina;
 * - 4–5★ z poprawnym tekstem publikują się na stronie od razu, 1–3★ czekają
 *   na decyzję admina — i strona to otwarcie mówi (wymóg przejrzystości UE);
 * - średnia na stronie liczy WSZYSTKIE opinie, nie tylko opublikowane;
 * - link do Google dostaje każdy klient (warunkowe kierowanie tylko zadowolonych
 *   łamie zasady opinii Google).
 */

export type Feedback = {
  id: string;
  createdAt: string;
  rating: 1 | 2 | 3 | 4 | 5;
  name: string;
  text: string;
  /** Ścieżka, którą zaproponowaliśmy klientowi. */
  route: "google" | "privato";
  status: "nuovo" | "gestito";
  handledAt: string | null;
  published: boolean;
  /** Opinia z „Moich zamówień” — przypięta do prawdziwego zamówienia. */
  orderId: string | null;
  email: string | null;
  /** Nazwy plików w `.data/uploads`. */
  photos?: string[];
  /** Zdjęcia pokazujemy publicznie dopiero po zatwierdzeniu w panelu. */
  photosApproved?: boolean;
};

type Db = { items: Feedback[]; reactions: Record<ReactionKind, number> };

export const REACTIONS = ["amore", "buonissima", "pazzesca", "fuoco"] as const;
export type ReactionKind = (typeof REACTIONS)[number];

const store = jsonStore<Db>("feedback.json", () => ({ items: [], reactions: { amore: 0, buonissima: 0, pazzesca: 0, fuoco: 0 } }));

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export class FeedbackError extends Error {}

/** Automatyczna publikacja tylko dla „czystych” tekstów: bez linków, kontaktów i wulgaryzmów. */
const BLOCK = /(https?:\/\/|www\.|@\S+\.|\+?\d[\d\s-]{7,}|\b(cazzo|merda|stronz|fuck|shit|kurw|chuj|scheiß|putain|mierda)\w*)/i;
const autoPublishable = (rating: number, text: string) => rating >= 4 && text.length >= 8 && !BLOCK.test(text);

export async function addFeedback(input: unknown, extra: { orderId?: string; email?: string; name?: string; photos?: string[] } = {}) {
  const body = (input ?? {}) as Record<string, unknown>;
  const e = dictFor(isLang(body.lang) ? body.lang : "it").errors;
  const rating = Number(body.rating);
  if (![1, 2, 3, 4, 5].includes(rating)) throw new FeedbackError(e.rating);
  const text = str(body.text, 1000);
  const name = extra.name ?? str(body.name, 60);
  if (rating <= 3 && text.length < 5) throw new FeedbackError(e.tellUs);
  const email = extra.email ?? str(body.email, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new FeedbackError(e.email);

  const item: Feedback = {
    id: randomBytes(8).toString("base64url"),
    createdAt: new Date().toISOString(),
    rating: rating as Feedback["rating"],
    name: name || "Anonimo",
    text,
    route: rating >= 4 ? "google" : "privato",
    status: "nuovo",
    handledAt: null,
    published: autoPublishable(rating, text),
    orderId: extra.orderId ?? null,
    email,
    photos: extra.photos ?? [],
    photosApproved: false,
  };

  await store.mutate((db) => {
    if (item.orderId && db.items.some((i) => i.orderId === item.orderId)) throw new FeedbackError(e.alreadyReviewed);
    db.items.unshift(item);
    db.items = db.items.slice(0, 5000);
  });
  const lang = isLang(body.lang) ? body.lang : "it";
  sendThanks(item, lang).catch(() => undefined);
  return item;
}

/** E-mail z podziękowaniem: zadowolonym — link do Google, niezadowolonym — obietnica kontaktu. */
async function sendThanks(item: Feedback, lang: Lang) {
  if (!item.email) return;
  const t = dictFor(lang).reviews;
  const happy = item.rating >= 4;
  const message = happy ? t.thanksMailHappy(item.name) : t.thanksMailSad(item.name);
  const google = RESTAURANT.googlePlaceId ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(RESTAURANT.googlePlaceId)}` : RESTAURANT.mapsUrl;
  const html = layout(
    lang,
    `<div style="background:${happy ? "#ffcf3f" : "#ffd5e5"};border:3px solid #120c08;border-radius:28px;padding:28px">
    <p style="margin:0;font-size:30px">${"★".repeat(item.rating)}<span style="opacity:.25">${"★".repeat(5 - item.rating)}</span></p>
    <h1 style="margin:10px 0 0;font-size:30px;line-height:1.05">${esc(t.thanksSubject)}</h1>
    <p style="margin:14px 0 0;font-size:17px">${esc(message)}</p>
    ${happy ? `<p style="margin:22px 0 0"><a href="${esc(google)}" style="display:inline-block;background:#120c08;color:#fff8ec;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:999px">${esc(t.thanksMailGoogle)}</a></p>` : ""}
  </div>`,
  );
  await sendMail({ to: item.email, subject: t.thanksSubject, html, text: `${message}${happy ? `\n\n${t.thanksMailGoogle}: ${google}` : ""}`, tag: "review-thanks" });
}

export async function listFeedback() {
  const db = await store.read();
  const items = db.items;
  return {
    items,
    stats: {
      total: items.length,
      toGoogle: items.filter((i) => i.route === "google").length,
      privateTotal: items.filter((i) => i.route === "privato").length,
      privateHandled: items.filter((i) => i.route === "privato" && i.status === "gestito").length,
      open: items.filter((i) => i.status === "nuovo" && i.route === "privato").length,
      published: items.filter((i) => i.published).length,
      average: items.length ? items.reduce((n, i) => n + i.rating, 0) / items.length : 0,
    },
    reactions: db.reactions,
  };
}

/** Opinie widoczne na stronie + statystyki ze wszystkich ocen. Bez e-maili. */
export async function publicFeedback() {
  const items = (await store.read()).items;
  return {
    items: items
      .filter((i) => i.published)
      .slice(0, 300)
      .map((i) => ({
        id: i.id,
        rating: i.rating,
        name: i.name,
        text: i.text,
        createdAt: i.createdAt,
        verified: Boolean(i.orderId),
        photos: i.photosApproved ? (i.photos ?? []).map((p) => `/api/uploads/${p}`) : [],
      })),
    count: items.length,
    average: items.length ? items.reduce((n, i) => n + i.rating, 0) / items.length : 0,
  };
}

export async function feedbackByOrders(orderIds: string[]) {
  const ids = new Set(orderIds);
  return (await store.read()).items.filter((i) => i.orderId && ids.has(i.orderId));
}

export type FeedbackAction = "handled" | "publish" | "unpublish" | "photosOn" | "photosOff";

export async function updateFeedback(id: string, action: FeedbackAction) {
  return store.mutate((db) => {
    const item = db.items.find((i) => i.id === id);
    if (!item) return null;
    if (action === "handled") {
      item.status = "gestito";
      item.handledAt = new Date().toISOString();
    } else if (action === "photosOn" || action === "photosOff") {
      item.photosApproved = action === "photosOn";
    } else {
      item.published = action === "publish";
    }
    return item;
  });
}

/** Liczniki z uzupełnionymi zerami — starsze pliki nie znają nowszych reakcji. */
export async function getReactions() {
  const saved = (await store.read()).reactions ?? {};
  return Object.fromEntries(REACTIONS.map((k) => [k, saved[k] ?? 0])) as Record<ReactionKind, number>;
}

export async function addReaction(kind: string) {
  if (!(REACTIONS as readonly string[]).includes(kind)) throw new FeedbackError("Reazione sconosciuta.");
  return store.mutate((db) => {
    db.reactions[kind as ReactionKind] = (db.reactions[kind as ReactionKind] ?? 0) + 1;
    return Object.fromEntries(REACTIONS.map((k) => [k, db.reactions[k] ?? 0])) as Record<ReactionKind, number>;
  });
}
