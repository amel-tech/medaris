import { redirect } from "next/navigation";

/** Keşfet moved to `/discover` (MDRS-159); the old address, with its locale, still lands there. */
export default async function Learning({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/discover`);
}
