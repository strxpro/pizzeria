"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DEFAULT_SETTINGS, type ShopSettings } from "./format";

const ShopContext = createContext<ShopSettings>(DEFAULT_SETTINGS);

/**
 * Godziny otwarcia i pauza z panelu admina. Start z danych serwera, potem odświeżane co minutę
 * (zamknięcie lokalu z panelu dociera do otwartych stron bez przeładowania).
 */
export function ShopProvider({ initial, children }: { initial: ShopSettings; children: ReactNode }) {
  const [settings, setSettings] = useState(initial);
  useEffect(() => {
    const id = setInterval(() => {
      fetch("/api/settings", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((s: ShopSettings | null) => s && setSettings(s))
        .catch(() => undefined);
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  return <ShopContext.Provider value={settings}>{children}</ShopContext.Provider>;
}

export const useShop = () => useContext(ShopContext);
