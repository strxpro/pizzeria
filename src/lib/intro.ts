"use client";

import { useSyncExternalStore } from "react";

/**
 * Sygnał „preloader zszedł”. Hero startuje swoje animacje dopiero wtedy,
 * żeby nie grały schowane pod zasłoną.
 */
let done = false;
const listeners = new Set<() => void>();

export function finishIntro() {
  if (done) return;
  done = true;
  listeners.forEach((l) => l());
}

export function useIntroDone() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => done,
    () => false,
  );
}
