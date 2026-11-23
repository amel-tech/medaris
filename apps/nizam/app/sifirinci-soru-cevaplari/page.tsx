import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ZerothAnswersPage } from "~/features/zeroth-answers/components/zeroth-answers-page";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.ZerothAnswersPage");
  return { title: t("title") };
}

/**
 * Sıfırıncı soru cevapları (MDRS-299), platform management's: the başnazım,
 * and a Medaris nazımı given exam.zeroth_read, read every köşk. Anyone else
 * gets the "Bu bölüm için izniniz yok" screen (nizam/06).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ZerothAnswersPage kosk={null} searchParams={await searchParams} />;
}
