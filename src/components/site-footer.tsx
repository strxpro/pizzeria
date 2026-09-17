"use client";

import Link from "next/link";
import { RESTAURANT } from "@/lib/data";
import { displayTime } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import { useShop } from "@/lib/shop";
import { FooterBox } from "./footer-box";
import { OpenStatus } from "./open-status";
import { Mark } from "./preloader";

/** Prosta stopka: znak, kontakt, godziny, linki — i duże pudełko wlatujące pośrodku. */
export function SiteFooter() {
  const t = useT();
  const { hours: opening } = useShop();
  const hours = [...opening].sort((a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7)).map((o) => `${t.open.daysShort[o.day]} ${o.open ? `${o.open}–${displayTime(o.close ?? "")}` : t.open.closed.toLowerCase()}`);
  const links = [
    ["#menu", t.nav.menu],
    ["#come-funziona", t.nav.how],
    ["#consegna", t.nav.delivery],
    ["#faq", t.nav.faq],
  ] as const;

  return (
    <footer id="contatti" className="relative z-10 rounded-t-(--radius-panel) bg-notte text-paper">
      {/* komputer: pudełko w środkowej kolumnie, rogiem ponad górną krawędzią stopki */}
      <FooterBox className="absolute -top-28 left-1/2 hidden -translate-x-1/2 lg:block" />

      <div className="container-page relative grid gap-8 pt-14 pb-10 sm:grid-cols-2 lg:grid-cols-[1fr_minmax(24rem,1fr)_1fr] lg:pb-16">
        <div>
          <a href="#top" className="inline-flex items-center gap-2.5">
            <Mark className="size-10 text-giallo" />
            <span className="text-2xl font-extrabold tracking-tight">{RESTAURANT.name}</span>
          </a>
          <p className="mt-3 max-w-[30ch] font-semibold opacity-80">{t.footer.tagline}</p>
          <OpenStatus className="mt-4 text-ink" />
          <nav aria-label={t.footer.site} className="mt-6">
            <ul className="flex flex-wrap gap-x-5 gap-y-1.5 font-bold">
              {links.map(([href, label]) => (
                <li key={href}>
                  <a href={href} className="hover:text-giallo">
                    {label}
                  </a>
                </li>
              ))}
              <li>
                <Link href="/i-miei-ordini" className="text-giallo hover:underline">
                  {t.nav.myOrders}
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="hidden lg:block" />

        <div className="font-semibold lg:text-right">
          <p className="text-sm font-bold tracking-widest text-giallo uppercase">{t.footer.contacts}</p>
          <a href={RESTAURANT.phoneHref} className="mt-3 block text-2xl font-extrabold hover:text-giallo">
            {RESTAURANT.phone}
          </a>
          <p className="mt-1 opacity-80">
            {RESTAURANT.street}, {RESTAURANT.city}
          </p>
          <p className="mt-3 text-sm leading-relaxed opacity-80">{hours.join(" · ")}</p>
        </div>
      </div>

      {/* telefon: pudełko pod treścią */}
      <div className="relative z-10 h-80 overflow-x-clip lg:hidden">
        <FooterBox className="absolute -top-2 left-1/2 -translate-x-1/2" />
      </div>

      {/* pełny pasek nad pudełkiem: dół pudełka chowa się w stopkę */}
      <div className="relative border-t border-paper/15 bg-[#221946]">
        <p className="container-page py-5 text-sm font-semibold opacity-80 max-lg:pb-28">
          © {new Date().getFullYear()} {RESTAURANT.name} · {t.footer.rights}
        </p>
      </div>
    </footer>
  );
}
