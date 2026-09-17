"use client";

import { useT } from "@/lib/i18n/provider";
import { useOrder, type Payment } from "@/lib/order";

/**
 * Wybór płatności przy odbiorze: karta albo gotówka, z symbolami.
 * Ten sam stan w paragonie i w szufladzie zamówienia, pod spodem czytelne „zapłacisz: …”.
 */
export function PaymentPicker({ size = "lg" }: { size?: "sm" | "lg" }) {
  const t = useT();
  const { payment, setPayment } = useOrder();
  const options: [Payment, string, string][] = [
    ["card", t.order.payCard, t.order.payCardSub],
    ["cash", t.order.payCash, t.order.payCashSub],
  ];
  const chosen = payment === "card" ? t.order.payCard : t.order.payCash;
  const lg = size === "lg";

  return (
    <div>
      <div role="radiogroup" aria-label={t.order.payment} className={`grid grid-cols-2 ${lg ? "gap-3" : "gap-2"}`}>
        {options.map(([value, label, sub]) => {
          const on = payment === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setPayment(value)}
              className={`btn-3d ${lg ? "" : "btn-3d-sm"} flex items-center gap-3 rounded-[1.25rem] text-left ${lg ? "min-h-[4.5rem] px-3 py-2" : "min-h-12 px-2.5 py-1.5"} ${on ? "bg-ink text-paper" : "bg-paper"}`}
            >
              <span className={`flex shrink-0 items-center justify-center rounded-xl ${lg ? "size-11" : "size-8"} ${on ? "bg-giallo text-ink" : "bg-ink/[0.06]"}`}>
                {value === "card" ? <CardIcon className={lg ? "size-7" : "size-5"} /> : <CashIcon className={lg ? "size-7" : "size-5"} />}
              </span>
              <span className="min-w-0">
                <span className={`block leading-tight font-extrabold ${lg ? "text-lg" : "text-sm"}`}>{label}</span>
                {lg ? <span className="block text-sm leading-tight font-semibold opacity-75">{sub}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
      <p className={`font-bold ${lg ? "mt-3" : "mt-2 text-center text-xs tracking-wide uppercase"}`} aria-live="polite">
        {t.order.payWith(chosen.toLowerCase())}
      </p>
    </div>
  );
}

export function CardIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="7" width="26" height="18" rx="3.5" />
      <path d="M3 12.5h26" strokeWidth="3.4" />
      <rect x="7" y="17" width="6" height="4" rx="1" fill="currentColor" stroke="none" />
      <path d="M17 19.5h7" />
    </svg>
  );
}

export function CashIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2.5" y="8" width="23" height="14" rx="2.5" />
      <circle cx="14" cy="15" r="3.4" />
      <path d="M6.5 11.5v.01M21.5 18.5v.01" strokeWidth="3" />
      <circle cx="24" cy="22.5" r="5.5" fill="currentColor" stroke="none" opacity="0.18" />
      <circle cx="24" cy="22.5" r="5.5" />
      <path d="M24 20v5" />
    </svg>
  );
}
