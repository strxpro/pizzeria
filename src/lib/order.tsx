"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { RESTAURANT, ZONES, type MenuItem, type Mode, type Zone } from "./data";
import { useMenu } from "./menu";
import { zoneFor, type LatLng } from "./geo";
import { useLang } from "./i18n/provider";
import type { PublicOrder } from "./order-types";

/**
 * Koszyk po stronie przeglądarki. Pozycje, tryb i strefa zapisują się
 * w `localStorage`; pozycja GPS klienta żyje tylko w pamięci karty.
 */

export type { Mode };

export type Located = LatLng & { address: string | null; km: number; zoneId: string | null };

type Line = { item: MenuItem; qty: number };

export type Payment = "card" | "cash";
export type CheckoutDetails = { name: string; phone: string; email: string; address: string; notes: string };

type OrderContextValue = {
  lines: Line[];
  count: number;
  subtotal: number;
  mode: Mode;
  zone: Zone | null;
  deliveryFee: number;
  total: number;
  /** Ile brakuje do minimum strefy; 0 gdy minimum osiągnięte. */
  missingForMinimum: number;
  located: Located | null;
  activeOrderId: string | null;
  setActiveOrderId: (id: string | null) => void;
  /** Jak klient zapłaci przy odbiorze — wybór wspólny dla paragonu i szuflady. */
  payment: Payment;
  setPayment: (payment: Payment) => void;
  qtyOf: (id: string) => number;
  add: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
  setMode: (mode: Mode) => void;
  setZoneId: (id: string) => void;
  locate: () => Promise<Located>;
  forgetLocation: () => void;
  /** „Riordina”: wkłada do koszyka pozycje z dawnego zamówienia (tylko te, które wciąż są w menu). */
  reorder: (lines: { id: string; qty: number }[]) => void;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  submit: (details: CheckoutDetails) => Promise<PublicOrder>;
};

const OrderContext = createContext<OrderContextValue | null>(null);

const STORAGE_KEY = "pizzeria-ordine-v1";
const MAX_QTY = 20;

type Stored = { quantities: Record<string, number>; mode: Mode; zoneId: string; located: Located | null; activeOrderId?: string | null; payment: Payment };

const EMPTY: Stored = { quantities: {}, mode: "domicilio", zoneId: ZONES[0].id, located: null, activeOrderId: null, payment: "card" };
let current: Stored | null = null;
const listeners = new Set<() => void>();

function load(): Stored {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!saved || typeof saved !== "object") return EMPTY;
    // pozycje, których nie ma już w menu, odpadają przy liczeniu koszyka (menu jest edytowalne)
    const quantities: Record<string, number> = {};
    for (const [id, n] of Object.entries(saved.quantities ?? {})) {
      if (Number.isInteger(n) && (n as number) > 0) quantities[id] = Math.min(n as number, MAX_QTY);
    }
    return {
      quantities,
      mode: saved.mode === "ritiro" ? "ritiro" : "domicilio",
      zoneId: ZONES.some((z) => z.id === saved.zoneId) ? saved.zoneId : ZONES[0].id,
      located: null,
      activeOrderId: typeof saved.activeOrderId === "string" ? saved.activeOrderId : null,
      payment: saved.payment === "cash" ? "cash" : "card",
    };
  } catch {
    return EMPTY;
  }
}

const getSnapshot = () => (current ??= load());
const getServerSnapshot = () => EMPTY;

function update(fn: (s: Stored) => Stored) {
  current = fn(getSnapshot());
  try {
    // Bez pozycji — nie zostawiamy współrzędnych klienta w przeglądarce.
    const { quantities, mode, zoneId, activeOrderId, payment } = current;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ quantities, mode, zoneId, activeOrderId, payment }));
  } catch {
    /* tryb prywatny — koszyk działa, tylko się nie zapamięta */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    const located = current?.located ?? null;
    current = { ...load(), located };
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** `kind` tłumaczy komponent — tu nie znamy języka. */
export class LocateError extends Error {
  constructor(public kind: "denied" | "notFound" | "unsupported") {
    super(kind);
  }
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new LocateError("unsupported"));
    navigator.geolocation.getCurrentPosition(
      resolve,
      (err) => reject(new LocateError(err.code === err.PERMISSION_DENIED ? "denied" : "notFound")),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

export function OrderProvider({ children }: { children: ReactNode }) {
  const { quantities, mode, zoneId, located, activeOrderId, payment } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const { items: menuItems } = useMenu();
  const [isOpen, setOpen] = useState(false);
  const { lang, t } = useLang();

  const setActiveOrderId = useCallback((id: string | null) => update((s) => ({ ...s, activeOrderId: id })), []);
  const setPayment = useCallback((p: Payment) => update((s) => ({ ...s, payment: p })), []);

  const add = useCallback((id: string) => {
    update((s) => ({ ...s, quantities: { ...s.quantities, [id]: Math.min((s.quantities[id] ?? 0) + 1, MAX_QTY) } }));
  }, []);

  const remove = useCallback((id: string) => {
    update((s) => {
      const q = { ...s.quantities };
      if ((q[id] ?? 0) <= 1) delete q[id];
      else q[id] -= 1;
      return { ...s, quantities: q };
    });
  }, []);

  const clear = useCallback(() => update((s) => ({ ...s, quantities: {} })), []);
  const setMode = useCallback((m: Mode) => update((s) => ({ ...s, mode: m })), []);
  const setZoneId = useCallback((id: string) => update((s) => ({ ...s, zoneId: id })), []);
  const forgetLocation = useCallback(() => update((s) => ({ ...s, located: null })), []);

  const locate = useCallback(async () => {
    const pos = await getPosition();
    const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const { zone, km } = zoneFor(point);
    let address: string | null = null;
    try {
      const res = await fetch(`/api/geocode?lat=${point.lat}&lng=${point.lng}`);
      address = ((await res.json()) as { address: string | null }).address;
    } catch {
      /* adres wpisze klient */
    }
    const result: Located = { ...point, address, km, zoneId: zone?.id ?? null };
    update((s) => ({
      ...s,
      located: result,
      zoneId: zone?.id ?? s.zoneId,
      // Poza zasięgiem zostaje tylko odbiór osobisty.
      mode: zone ? "domicilio" : "ritiro",
    }));
    return result;
  }, []);

  const value = useMemo<OrderContextValue>(() => {
    const lines = menuItems.filter((i) => quantities[i.id]).map((item) => ({ item, qty: quantities[item.id] }));
    const count = lines.reduce((n, l) => n + l.qty, 0);
    const subtotal = lines.reduce((n, l) => n + l.qty * l.item.price, 0);
    const zone = mode === "domicilio" ? (ZONES.find((z) => z.id === zoneId) ?? null) : null;
    const deliveryFee = zone && subtotal < RESTAURANT.freeDeliveryFrom ? zone.fee : 0;
    const missingForMinimum = zone ? Math.max(0, zone.minimum - subtotal) : 0;

    return {
      lines,
      count,
      subtotal,
      mode,
      zone,
      deliveryFee,
      total: subtotal + deliveryFee,
      missingForMinimum,
      located,
      activeOrderId: activeOrderId ?? null,
      setActiveOrderId,
      payment,
      setPayment,
      qtyOf: (id) => quantities[id] ?? 0,
      add,
      remove,
      clear,
      setMode,
      setZoneId,
      locate,
      forgetLocation,
      reorder: (items) =>
        update((s) => {
          const known = new Set(menuItems.map((i) => i.id));
          const q: Record<string, number> = {};
          for (const l of items) if (known.has(l.id)) q[l.id] = Math.min(MAX_QTY, (q[l.id] ?? 0) + l.qty);
          return { ...s, quantities: q };
        }),
      isOpen,
      setOpen,
      submit: async (details) => {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...details,
            paymentMethod: payment,
            lang,
            mode,
            zoneId,
            // Pozycję wysyłamy tylko wtedy, gdy klient sam jej użył.
            location: mode === "domicilio" && located?.zoneId ? { lat: located.lat, lng: located.lng } : null,
            lines: lines.map((l) => ({ id: l.item.id, qty: l.qty })),
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { order?: PublicOrder; error?: string };
        if (!res.ok || !data.order) throw new Error(data.error ?? t.common.somethingWrong);
        setActiveOrderId(data.order.id);
        return data.order;
      },
    };
  }, [menuItems, quantities, mode, zoneId, located, activeOrderId, payment, isOpen, add, remove, clear, setMode, setZoneId, locate, forgetLocation, setActiveOrderId, setPayment, lang, t]);

  return <OrderContext.Provider value={value}>{children}</OrderContext.Provider>;
}

export function useOrder() {
  const ctx = useContext(OrderContext);
  if (!ctx) throw new Error("useOrder poza <OrderProvider>");
  return ctx;
}
