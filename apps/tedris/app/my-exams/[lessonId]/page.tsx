import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MyExamResult } from "~/features/online-exams/components/my-exam-result";
import { getMyExamResult } from "~/features/online-exams/my-reads";

// Behind the sign-in middleware (not in `publicPages`), and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tedrisLearn.MyExams");
  return { title: `${t("pageTitle")} | Tedris` };
}

/** The talebe's own screen of a past online exam (MDRS-299, `graphs/tedris/exams/result`). */
export default async function Page({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  return <MyExamResult read={await getMyExamResult(lessonId)} />;
}
