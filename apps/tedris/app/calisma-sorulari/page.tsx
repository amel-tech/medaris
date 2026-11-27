import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PracticeListPage } from "~/features/practice/components/practice-list-page";
import { getMyPracticeSets } from "~/features/practice/reads";

// Behind the sign-in middleware (not in `publicPages`), and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tedris.Practice");
  return { title: `${t("pageTitle")} | Tedris` };
}

/** Çalışma Soruları (MDRS-248, Faz 3): the talebe's sets, by course. */
export default async function Page() {
  return <PracticeListPage sets={await getMyPracticeSets()} />;
}
