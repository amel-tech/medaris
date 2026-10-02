import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { GrantsView } from "~/features/grants/components/grants-view";
import { getKoskGrants } from "~/features/grants/reads";
import { getKoskById, getMe } from "~/features/kosks/actions";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.KoskGrantsPage");
  return { title: t("title") };
}

/**
 * İzinler (design nizam/38): the ders nazırları of this köşk's medrese-free
 * courses and what they may do, for the köşk's nazım and the başnazım.
 * Anyone else, or a köşk that is not there, gets the "Bu bölüm için izniniz
 * yok" screen (nizam/06): the 403 and the 404 look the same on purpose.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const [kosk, grants, me] = await Promise.all([
    getKoskById(id),
    getKoskGrants(id),
    getMe(),
  ]);

  if (!kosk || grants === "not-found") notFound();
  if (grants === "forbidden") forbidden();

  return (
    <div className="mx-auto max-w-[72rem] px-gutter py-8">
      <GrantsView koskId={kosk.id} data={grants} viewerId={me?.id ?? null} />
    </div>
  );
}
