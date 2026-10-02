import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HostingView } from "~/features/hosting/components/hosting-view";
import { getHostingRights, getMadrasahOptions } from "~/features/hosting/reads";
import { getKoskById } from "~/features/kosks/actions";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.HostingPage");
  return { title: t("title") };
}

/**
 * Barındırma hakları (design nizam/26, with nizam/27's dialog): the medreses
 * that may open courses in this köşk, for its nazımları and the başnazım.
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
  const [kosk, rights, madrasahs] = await Promise.all([
    getKoskById(id),
    getHostingRights(id),
    getMadrasahOptions(),
  ]);

  if (rights === "not-found") notFound();
  if (rights === "forbidden") forbidden();
  if (!kosk) notFound();

  return (
    <div className="mx-auto max-w-[72rem] px-gutter py-8">
      <HostingView
        koskId={kosk.id}
        koskName={kosk.name}
        rights={rights}
        madrasahs={madrasahs}
      />
    </div>
  );
}
