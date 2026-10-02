import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArchiveView } from "~/features/archive/components/archive-view";
import {
  getKoskArchive,
  KOSK_ARCHIVE_PAGE_SIZE,
} from "~/features/archive/reads";
import { getKoskById } from "~/features/kosks/actions";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.ArchivePage");
  return { title: t("title") };
}

/**
 * Arşiv (design nizam/28): what was hidden in this köşk, for its nazım. A
 * caller who is not one of its nazıms, or a köşk that is not there, gets the
 * "Bu bölüm için izniniz yok" screen (nizam/06): the 403 and the 404 look the
 * same on purpose.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const [kosk, archive] = await Promise.all([
    getKoskById(id),
    getKoskArchive(id),
  ]);

  if (!kosk || archive === "not-found") notFound();
  if (archive === "forbidden") forbidden();

  return (
    <div className="mx-auto max-w-[72rem] px-gutter py-8">
      <ArchiveView
        mode={{ kind: "kosk", koskId: kosk.id, koskName: kosk.name }}
        initial={archive}
        pageSize={KOSK_ARCHIVE_PAGE_SIZE}
      />
    </div>
  );
}
