import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ApplicationsView } from "~/features/platform-admin/components/applications-view";
import { getPendingKoskApplications } from "~/features/platform-admin/reads";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.KoskApplicationsPage");
  return { title: t("title") };
}

/**
 * Köşk başvuruları (design nizam/15). The menu entry has always pointed at
 * `/talepler/kosk-basvurulari`, so the page lives there rather than at the
 * `/kosk-basvurulari` the spec suggested. tedrisat answers anyone but the
 * başnazım and a Medaris nazımı holding the permission 403, which shows the
 * "Bu bölüm için izniniz yok" screen (nizam/06).
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ secili?: string | string[] }>;
}) {
  const { locale } = await params;
  const { secili } = await searchParams;
  setRequestLocale(locale);
  const applications = await getPendingKoskApplications();
  if (applications === "forbidden") forbidden();

  return (
    <div className="mx-auto w-full max-w-[80rem] px-gutter py-8">
      <ApplicationsView
        initial={applications === "not-found" ? null : applications}
        initialSelectedId={typeof secili === "string" ? secili : null}
      />
    </div>
  );
}
