import { redirect } from "next/navigation";

/** Keşfet moved to `/discover` (MDRS-159); the old address, with its locale, still lands there. */
export default async function Learning() {
  redirect(`/discover`);
}
