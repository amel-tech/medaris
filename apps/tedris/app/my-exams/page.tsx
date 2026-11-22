import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MyExamsPage } from "~/features/online-exams/components/my-exams-page";
import { getMyExams } from "~/features/online-exams/my-reads";

// Behind the sign-in middleware (not in `publicPages`), and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tedrisLearn.MyExams");
  return { title: `${t("pageTitle")} | Tedris` };
}

/** Sınavlarım (MDRS-299, `graphs/tedris/exams/mine`). */
export default async function Page() {
  return <MyExamsPage exams={await getMyExams()} />;
}
