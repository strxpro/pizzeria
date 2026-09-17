import { BoxScene } from "@/components/box-scene";
import { CheeseTransition, MeltDivider } from "@/components/cheese";
import { Delivery } from "@/components/delivery";
import { Faq } from "@/components/faq";
import { Hero } from "@/components/hero";
import { Ingredients } from "@/components/ingredients";
import { Menu } from "@/components/menu";
import { OrderDrawer } from "@/components/order-drawer";
import { Preloader } from "@/components/preloader";
import { Reviews } from "@/components/reviews";
import { Ribbon } from "@/components/ribbon";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Steps } from "@/components/steps";
import { WhyUs } from "@/components/why-us";

/**
 * Landing page w rytmie referencji: żółte hero → ser topiący się na menu →
 * karuzela pizz → przypięty stepper „jak to działa” → wstęgi → pudełko 3D,
 * które wjeżdża w pizzę → składniki → dostawa → opinie → naklejki → pytania → stopka.
 */
export default function Home() {
  return (
    <>
      <Preloader />
      <SiteHeader />
      <main>
        <Hero />
        <MeltDivider />
        <Menu />
        <Steps />
        <Ribbon />
        <BoxScene />
        <Ingredients />
        <Delivery />
        <Reviews />
        <WhyUs />
        <Faq />
      </main>
      <SiteFooter />
      <OrderDrawer />
      <CheeseTransition />
    </>
  );
}
