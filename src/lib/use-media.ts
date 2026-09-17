"use client";

import { useSyncExternalStore } from "react";

/** `matchMedia` jako stan Reacta. Na serwerze zwraca `fallback`. */
export function useMedia(query: string, fallback = false) {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => fallback,
  );
}
