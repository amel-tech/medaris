import type { Metadata } from "next";
import { ExamPage } from "~/features/online-exams/components/exam-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazar.OnlineExams");
  return { title: t("title") };
}

/** One online exam's draft (MDRS-299): its topics and questions. */
export default async function Page({
  params,
}: {
  params: Promise<{ dersId: string; sinavId: string }>;
}) {
  const { dersId, sinavId } = await params;
  return <ExamPage courseId={dersId} examId={sinavId} />;
}
