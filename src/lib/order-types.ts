import type { Mode, OrderStatus } from "./data";
import type { LatLng } from "./geo";
import type { Lang } from "./i18n";

export type OrderLine = { id: string; name: string; qty: number; price: number };

export type EmailLog = { at: string; status: OrderStatus; subject: string; sent: boolean; note?: string };

export type Order = {
  id: string;
  createdAt: string;
  mode: Mode;
  status: OrderStatus;
  history: { status: OrderStatus; at: string }[];
  customer: { name: string; phone: string; email: string };
  address: string | null;
  location: LatLng | null;
  zoneId: string | null;
  zoneName: string | null;
  travelMinutes: number;
  lines: OrderLine[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: "card" | "cash";
  notes: string;
  /** Zamówienie złożone, gdy lokal był zamknięty — wyjdzie po otwarciu. */
  placedWhileClosed: boolean;
  /** Język klienta — w nim wysyłamy e-maile. */
  lang: Lang;
  /** Powód odrzucenia (tylko przy statusie `rifiutato`). */
  rejectReason: string | null;
  /** Ostatnia pozycja GPS kierowcy (wysyłana z panelu admina w trakcie dostawy). */
  rider?: (LatLng & { at: string }) | null;
  emails: EmailLog[];
};

/** To, co widzi klient na stronie śledzenia — bez telefonu i z zamaskowanym e-mailem. */
export type PublicOrder = Omit<Order, "customer" | "emails"> & {
  customer: { name: string; email: string };
};

export function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  if (!domain) return "—";
  return `${user.slice(0, 1)}${"•".repeat(Math.max(2, Math.min(user.length - 1, 6)))}@${domain}`;
}

export function toPublic(order: Order): PublicOrder {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { customer, emails, ...rest } = order;
  return {
    ...rest,
    // Starsze zamówienia (sprzed wersji językowych) nie mają tych pól.
    lang: rest.lang ?? "it",
    rejectReason: rest.rejectReason ?? null,
    customer: { name: customer.name, email: maskEmail(customer.email) },
  };
}
