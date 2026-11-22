import type { Metadata } from "next";
import { TalebeAnswersPage } from "~/features/online-exams/components/talebe-answers-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazar.ExamAnswers");
  return { title: t("title") };
}

/** One talebe's answers on a published online exam (MDRS-299). */
export default async function Page({
  params,
}: {
  params: Promise<{ dersId: string; sinavId: string; talebeId: string }>;
}) {
  const { dersId, sinavId, talebeId } = await params;
  return (
    <TalebeAnswersPage courseId={dersId} examId={sinavId} userId={talebeId} />
  );
}
