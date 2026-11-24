import type { Metadata } from "next";
import { EvaluationPage } from "~/features/evaluation/components/evaluation-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazar.Evaluation");
  return { title: t("title") };
}

/** "Değerlendirme" of a course (MDRS-248); it wins over the shared placeholder's `[bolum]`. */
export default async function Page({
  params,
}: {
  params: Promise<{ dersId: string }>;
}) {
  const { dersId } = await params;
  return <EvaluationPage courseId={dersId} />;
}
