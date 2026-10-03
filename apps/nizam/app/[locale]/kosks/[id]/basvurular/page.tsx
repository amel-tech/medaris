import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ApplicationsView } from "~/features/applications/components/applications-view";
import { toRow } from "~/features/applications/present";
import { getKoskApplications } from "~/features/applications/reads";
import { getKoskById } from "~/features/kosks/actions";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.ApplicationsPage");
  return { title: t("title") };
}

/**
 * Başvurular (design nizam/31): the enrollment applications waiting in the
 * köşk's courses, for its nazım. Anyone else, or a köşk that is not there,
 * gets the "Bu bölüm için izniniz yok" screen (nizam/06): the 403 and the 404
 * look the same on purpose.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const [kosk, read] = await Promise.all([
    getKoskById(id),
    getKoskApplications(id),
  ]);

  if (read === "not-found") notFound();
  if (read === "forbidden") forbidden();
  // A köşk read that failed (null) leaves the name empty; the applications,
  // which tedrisat already authorised, are still shown.

  const t = await getTranslations("nizam.ApplicationsPage");
  const unnamed = t("unnamed");
  const rows =
    read === null
      ? null
      : read.pending.map((p) =>
          toRow(p, read.muderris[p.courseId] ?? [], unnamed)
        );

  return (
    <ApplicationsView koskId={id} koskName={kosk?.name ?? ""} initial={rows} />
  );
}
