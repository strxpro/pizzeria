import type { Metadata } from "next";
import { MyOrders } from "@/components/my-orders";
import { RESTAURANT } from "@/lib/data";

export const metadata: Metadata = {
  title: `I miei ordini — ${RESTAURANT.name}`,
  // Prywatna strona klienta — nie do wyszukiwarek.
  robots: { index: false, follow: false },
};

export default function MyOrdersPage() {
  return <MyOrders />;
}
