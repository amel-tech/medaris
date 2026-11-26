import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getKoskById } from "~/features/kosks/actions";
import { ZerothAnswersPage } from "~/features/zeroth-answers/components/zeroth-answers-page";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.ZerothAnswersPage");
  return { title: t("title") };
}

/**
 * Sıfırıncı soru cevapları (MDRS-299) of one köşk, for its nazım: a köşk
 * nazımı holds exam.zeroth_read in their köşk by role default and reads its
 * exams only (ui rule kosk-nazim-scope). A köşk that is not theirs gets the
 * "Bu bölüm için izniniz yok" screen (nizam/06).
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const kosk = await getKoskById(id);
  if (!kosk) notFound();
  return (
    <ZerothAnswersPage
      kosk={{ id: kosk.id, name: kosk.name }}
      searchParams={query}
    />
  );
}
