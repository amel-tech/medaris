import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArchiveView } from "~/features/archive/components/archive-view";
import {
  ARCHIVE_PAGE_SIZE,
  getArchiveScopes,
  getPlatformArchive,
} from "~/features/archive/reads";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.ArchivePage");
  return { title: t("title") };
}

/**
 * Arşiv — Kalıcı olarak sil (design nizam/29): everything hidden on the
 * platform, for the Medaris başnazımı alone. tedrisat answers anyone else 403,
 * which shows the "Bu bölüm için izniniz yok" screen (nizam/06).
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const archive = await getPlatformArchive();
  if (archive === "forbidden") forbidden();
  const scopes =
    archive && archive !== "not-found" ? await getArchiveScopes() : null;

  return (
    <div className="mx-auto max-w-[72rem] px-gutter py-8">
      <ArchiveView
        mode={{ kind: "platform" }}
        initial={archive === "not-found" ? null : archive}
        scopes={scopes}
        pageSize={ARCHIVE_PAGE_SIZE}
      />
    </div>
  );
}
