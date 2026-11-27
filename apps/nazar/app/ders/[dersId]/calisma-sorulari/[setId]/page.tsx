import type { Metadata } from "next";
import { ExamPage } from "~/features/online-exams/components/exam-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazar.Practice");
  return { title: t("title") };
}

/** One çalışma seti (MDRS-248): its questions, and "Yayınla" with no date. */
export default async function Page({
  params,
}: {
  params: Promise<{ dersId: string; setId: string }>;
}) {
  const { dersId, setId } = await params;
  return <ExamPage courseId={dersId} examId={setId} kind="PRACTICE" />;
}
