"use client";

import { useState } from "react";
import { ZONES } from "@/lib/data";
import { useT } from "@/lib/i18n/provider";
import { LocateError, useOrder } from "@/lib/order";

/** „Usa la mia posizione”: GPS → adres → strefa, z jasnym komunikatem, co wyszło. */
export function LocateButton({ className = "", onAddress }: { className?: string; onAddress?: (address: string) => void }) {
  const t = useT();
  const { locate, located } = useOrder();
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [error, setError] = useState<LocateError["kind"] | "other">("other");

  const run = async () => {
    setState("busy");
    try {
      const result = await locate();
      if (result.address) onAddress?.(result.address);
      setState("idle");
    } catch (e) {
      setError(e instanceof LocateError ? e.kind : "other");
      setState("error");
    }
  };

  const zone = located?.zoneId ? ZONES.find((z) => z.id === located.zoneId) : null;
  const km = located ? located.km.toFixed(1).replace(".", ",") : "";
  const errorText = { denied: t.locate.denied, notFound: t.locate.notFound, unsupported: t.locate.unsupported, other: t.locate.unavailable }[error];

  return (
    <div className={className}>
      <button
        type="button"
        onClick={run}
        disabled={state === "busy"}
        className="btn-3d flex h-14 w-full items-center justify-center gap-2 rounded-full bg-cielo px-5 text-lg font-extrabold disabled:opacity-80"
      >
        <svg viewBox="0 0 24 24" className={`size-5 ${state === "busy" ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="7" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
        </svg>
        {state === "busy" ? t.locate.searching : located ? t.locate.update : t.locate.use}
      </button>

      <p className="mt-2 min-h-6 text-center text-sm font-bold" role="status" aria-live="polite">
        {state === "error" ? errorText : located ? (zone ? t.locate.inZone(km, zone.name) : t.locate.outside(km)) : null}
      </p>
    </div>
  );
}
