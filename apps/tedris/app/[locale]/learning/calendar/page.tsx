import { redirect } from "next/navigation";

/** The subscription moved to Hesap (`/account/calendar`, MDRS-163); the old address, with its locale, still lands there. */
export default async function Learning({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/account/calendar`);
}
