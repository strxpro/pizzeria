import type { Metadata } from "next";
import { Kitchen } from "@/components/kitchen";
import { RESTAURANT } from "@/lib/data";

export const metadata: Metadata = {
  title: `Admin — ${RESTAURANT.name}`,
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <Kitchen />;
}
