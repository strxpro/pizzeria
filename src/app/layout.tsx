import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Kalam } from "next/font/google";
import { cookies, headers } from "next/headers";
import { SmoothScroll } from "@/components/smooth-scroll";
import { RESTAURANT } from "@/lib/data";
import { dictFor, LANG_COOKIE, pickLang } from "@/lib/i18n";
import { LangProvider } from "@/lib/i18n/provider";
import { MenuProvider } from "@/lib/menu";
import { OrderProvider } from "@/lib/order";
import { publicMenu } from "@/lib/server/menu";
import { getSettings } from "@/lib/server/settings";
import { ShopProvider } from "@/lib/shop";
import { ActiveOrderCTA } from "@/components/active-order-cta";
import "./globals.css";

/**
 * Bricolage Grotesque: grotesk z osią optyczną — w dużych rozmiarach ciasny i charakterny,
 * w małych czytelny. Kalam: odręczny krój do dopisków, z polskimi i niemieckimi znakami
 * (poprzedni Gochi Hand ich nie miał).
 */
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin", "latin-ext"],
  axes: ["opsz", "wdth"],
  display: "swap",
});

const kalam = Kalam({
  variable: "--font-gochi",
  weight: "400",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

/** Język żądania: ciasteczko > kraj z nagłówka hostingu > Accept-Language. */
async function requestLang() {
  const [c, h] = await Promise.all([cookies(), headers()]);
  return pickLang({
    cookie: c.get(LANG_COOKIE)?.value,
    country: h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry") ?? h.get("x-country-code"),
    acceptLanguage: h.get("accept-language"),
  });
}

export async function generateMetadata(): Promise<Metadata> {
  const t = dictFor(await requestLang());
  return { title: `${RESTAURANT.name} — ${t.meta.title}`, description: t.meta.description };
}

export const viewport: Viewport = {
  themeColor: "#ffcf3f",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = await requestLang();
  // menu z magazynu (edytowane w panelu) — zmiany widać od razu po odświeżeniu strony
  const [menu, settings] = await Promise.all([publicMenu(), getSettings()]);
  return (
    <html lang={lang} className={`${bricolage.variable} ${kalam.variable}`}>
      <head>
        {/* mapa Google w sekcji dostawy — połączenie gotowe, zanim klient tam dojedzie */}
        <link rel="preconnect" href="https://www.google.com" />
        <link rel="preconnect" href="https://maps.gstatic.com" crossOrigin="" />
      </head>
      <body className="antialiased">
        <SmoothScroll />
        <LangProvider initial={lang}>
          <ShopProvider initial={settings}>
            <MenuProvider menu={menu}>
              <OrderProvider>
                {children}
                <ActiveOrderCTA />
              </OrderProvider>
            </MenuProvider>
          </ShopProvider>
        </LangProvider>
      </body>
    </html>
  );
}
