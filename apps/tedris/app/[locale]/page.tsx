import { redirect } from "next/navigation";

/**
 * `/` has no page of its own: Ana sayfa (design tedris/01) is `/home`, open to a
 * visitor and different for a signed-in caller (MDRS-165).
 */
export default async function Root({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/home`);
}
