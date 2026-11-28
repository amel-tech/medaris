import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PracticeListPage } from "~/features/practice/components/practice-list-page";
import { getMyPracticeSets, getPracticePools } from "~/features/practice/reads";

// Behind the sign-in middleware (not in `publicPages`), and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tedris.Practice");
  return { title: `${t("pageTitle")} | Tedris` };
}

/** Çalışma Soruları (MDRS-248, Faz 3 and 4): the talebe's sets and each course's pool. */
export default async function Page() {
  const sets = await getMyPracticeSets();
  const pools = sets
    ? await getPracticePools([...new Set(sets.map((s) => s.courseId))])
    : new Map();
  return <PracticeListPage sets={sets} pools={pools} />;
}
