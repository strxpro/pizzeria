import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Tracking } from "@/components/tracking";
import { RESTAURANT } from "@/lib/data";
import { toPublic } from "@/lib/order-types";
import { getOrder } from "@/lib/server/orders";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Il tuo ordine — ${RESTAURANT.name}`,
  // Strona z adresem klienta — nie do wyszukiwarek.
  robots: { index: false, follow: false },
};

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const order = await getOrder((await params).id);
  if (!order) notFound();
  return <Tracking initial={toPublic(order)} />;
}
