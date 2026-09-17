"use client";

import { useEffect, useState } from "react";
import { openState, type OpenState } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import { useShop } from "@/lib/shop";

/**
 * „Aperto ora / Chiuso” liczone w czasie Genui. Renderowane dopiero w przeglądarce —
 * serwer nie wie, o której strona zostanie otwarta, więc wynik z serwera byłby nieaktualny.
 */
export function OpenStatus({ className = "" }: { className?: string }) {
  const t = useT();
  const settings = useShop();
  const [state, setState] = useState<OpenState | null>(null);

  useEffect(() => {
    const update = () => setState(openState(new Date(), settings));
    const first = setTimeout(update, 0);
    const id = setInterval(update, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [settings]);

  const label =
    state === null
      ? " "
      : state.open
        ? t.open.open(state.closesAt)
        : state.paused
          ? t.open.paused
        : state.opensAt && state.opensIn !== null && state.opensDay !== null
          ? t.open.closedOpens(state.opensIn === 0 ? t.open.today : state.opensIn === 1 ? t.open.tomorrow : t.open.days[state.opensDay], state.opensAt)
          : t.open.closed;

  return (
    <p className={`inline-flex h-9 items-center gap-2 rounded-full bg-paper px-4 text-sm font-bold ${className}`} aria-live="polite">
      <span aria-hidden className="relative flex size-2.5">
        {state?.open ? <span className="absolute inset-0 animate-ping rounded-full bg-basilico" /> : null}
        <span className={`relative size-2.5 rounded-full ${state === null ? "bg-line" : state.open ? "bg-basilico" : "bg-pomodoro"}`} />
      </span>
      {label}
    </p>
  );
}
