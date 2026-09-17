"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { MENU, type MenuCategory } from "./data";

/**
 * Aktualne menu z magazynu (edytowane w panelu admina), podane przez layout z serwera.
 * Bez providera — menu z kodu, żeby komponenty działały też w izolacji.
 */
const MenuContext = createContext<MenuCategory[]>(MENU);

export function MenuProvider({ menu, children }: { menu: MenuCategory[]; children: ReactNode }) {
  return <MenuContext.Provider value={menu}>{children}</MenuContext.Provider>;
}

export function useMenu() {
  const all = useContext(MenuContext);
  return useMemo(() => {
    const categories = all.filter((c) => c.items.length > 0);
    return { categories, items: categories.flatMap((c) => c.items) };
  }, [all]);
}
