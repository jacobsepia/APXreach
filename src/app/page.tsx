import { redirect } from "next/navigation";

/*
 * No marketing site yet — the product is the point. The landing page will come
 * with the apxledger.ca treatment when there is something to say publicly.
 */
export default function Home() {
  redirect("/dashboard");
}
