import { redirect } from "next/navigation";

/** Stary adres panelu — teraz jest pod /admin. */
export default function KitchenRedirect() {
  redirect("/admin");
}
