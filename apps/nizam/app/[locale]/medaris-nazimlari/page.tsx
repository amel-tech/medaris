import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { NazimsView } from "~/features/permissions/components/nazims-view";
import { getCatalog, getGroups, getNazims } from "~/features/permissions/reads";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.NazimsPage");
  return { title: t("title") };
}

/**
 * Medaris nazımları (design nizam/11): who holds the Medaris nazımı role and
 * with which permissions, for the Medaris başnazımı alone. tedrisat answers
 * anyone else 403, which shows the "Bu bölüm için izniniz yok" screen
 * (nizam/06).
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [nazims, catalog, groups] = await Promise.all([
    getNazims(),
    getCatalog(),
    getGroups(),
  ]);
  if ([nazims, catalog, groups].includes("forbidden")) forbidden();

  return (
    <div className="mx-auto w-full max-w-[80rem]">
      <NazimsView
        nazims={nazims === "forbidden" ? null : nazims}
        catalog={catalog === "forbidden" ? null : catalog}
        groups={groups === "forbidden" ? null : groups}
      />
    </div>
  );
}
