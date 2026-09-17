import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { EMAIL_STATUSES, RESTAURANT, type OrderStatus } from "../data";
import { euro } from "../format";
import { dictFor } from "../i18n";
import type { EmailLog, Order } from "../order-types";

/**
 * E-maile: powiadomienia o etapach zamówienia i kody logowania do „Moich zamówień”.
 *
 * Wysyłka przez API Resend (zwykły `fetch`), gdy ustawione są `RESEND_API_KEY`
 * i `EMAIL_FROM`. Bez nich wiadomość ląduje jako plik HTML w `.data/outbox/`,
 * a reszta aplikacji działa normalnie.
 */

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

export async function sendMail(msg: { to: string; subject: string; html: string; text: string; tag: string }): Promise<{ sent: boolean; note?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (key && from) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
      });
      return res.ok ? { sent: true } : { sent: false, note: `Resend ${res.status}` };
    } catch {
      return { sent: false, note: "Resend non raggiungibile" };
    }
  }

  const dir = path.join(process.cwd(), ".data", "outbox");
  await mkdir(dir, { recursive: true });
  const file = `${new Date().toISOString().replace(/[:.]/g, "-")}-${msg.tag}.html`;
  await writeFile(path.join(dir, file), msg.html, "utf8");
  return { sent: false, note: `Nessuna chiave email: salvata in .data/outbox/${file}` };
}

/** Wspólna ramka wiadomości w kolorach strony. */
export function layout(lang: string, body: string) {
  return `<!doctype html><html lang="${esc(lang)}"><body style="margin:0;background:#fff8ec;font-family:Arial,sans-serif;color:#120c08">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
  <p style="margin:0 0 8px;font-weight:700">${esc(RESTAURANT.name)}</p>
  ${body}
</div></body></html>`;
}

function renderStatus(order: Order, status: OrderStatus, trackUrl: string) {
  const t = dictFor(order.lang);
  const copy = t.status[status];
  const subject = t.email.subject(copy.title, order.id.slice(0, 6).toUpperCase());
  const rows = order.lines
    .map((l) => `<tr><td style="padding:6px 0">${l.qty} × ${esc(l.name)}</td><td style="padding:6px 0;text-align:right">${euro(l.qty * l.price)}</td></tr>`)
    .join("");

  const payLine = t.order.payWith((order.paymentMethod === "cash" ? t.order.payCash : t.order.payCard).toLowerCase());
  const reason = status === "rifiutato" && order.rejectReason ? `<p style="margin:12px 0 0;font-size:15px">${esc(t.tracking.reason(order.rejectReason))}</p>` : "";
  const html = layout(
    order.lang,
    `<div style="background:${status === "rifiutato" ? "#ffd5e5" : "#ffcf3f"};border:3px solid #120c08;border-radius:28px;padding:28px">
    <h1 style="margin:0;font-size:34px;line-height:1">${esc(copy.title)}</h1>
    <p style="margin:12px 0 0;font-size:17px">${esc(t.email.hello(order.customer.name))} ${esc(copy.text)}</p>${reason}
    <p style="margin:24px 0 0"><a href="${esc(trackUrl)}" style="display:inline-block;background:#120c08;color:#fff8ec;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:999px">${esc(t.email.follow)}</a></p>
  </div>
  <table style="width:100%;margin-top:24px;border-collapse:collapse;font-size:15px">${rows}
    ${order.deliveryFee ? `<tr><td style="padding:6px 0">${esc(t.order.delivery)}</td><td style="padding:6px 0;text-align:right">${euro(order.deliveryFee)}</td></tr>` : ""}
    <tr><td style="padding:10px 0;border-top:2px solid #120c08;font-weight:700">${esc(t.email.total)}</td><td style="padding:10px 0;border-top:2px solid #120c08;text-align:right;font-weight:700">${euro(order.total)}</td></tr>
  </table>
  <p style="font-size:15px;margin-top:16px;font-weight:700">${esc(payLine)}</p>
  <p style="font-size:13px;margin-top:24px">${order.mode === "domicilio" ? esc(t.email.deliverTo(order.address ?? "")) : esc(t.email.pickupAt(`${RESTAURANT.street}, ${RESTAURANT.city}`))}<br>${esc(t.email.questions)} ${esc(RESTAURANT.phone)}</p>`,
  );

  const text = `${copy.title}\n\n${copy.text}\n\n${t.email.follow}: ${trackUrl}\n${t.email.total}: ${euro(order.total)}\n${payLine}\n${RESTAURANT.phone}`;
  return { subject, html, text };
}

export async function notify(order: Order, status: OrderStatus, origin: string): Promise<EmailLog | null> {
  if (!EMAIL_STATUSES.includes(status)) return null;
  const trackUrl = `${process.env.SITE_URL ?? origin}/ordine/${order.id}`;
  const { subject, html, text } = renderStatus(order, status, trackUrl);
  const result = await sendMail({ to: order.customer.email, subject, html, text, tag: `${order.id.slice(0, 6)}-${status}` });
  return { at: new Date().toISOString(), status, subject, ...result };
}
