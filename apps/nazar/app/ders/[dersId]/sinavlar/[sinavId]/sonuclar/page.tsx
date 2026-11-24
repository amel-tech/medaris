import type { Metadata } from "next";
import { ResultsPage } from "~/features/online-exams/components/results-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazar.ExamResults");
  return { title: t("title") };
}

/** One published online exam's results (MDRS-299). */
export default async function Page({
  params,
}: {
  params: Promise<{ dersId: string; sinavId: string }>;
}) {
  const { dersId, sinavId } = await params;
  return <ResultsPage courseId={dersId} examId={sinavId} />;
}
