import type { Metadata } from "next";
import { ExamsPage } from "~/features/online-exams/components/exams-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazar.Practice");
  return { title: t("title") };
}

/** "Çalışma Soruları" of a course (MDRS-248): its çalışma setleri; it wins over the shared placeholder's `[bolum]`. */
export default async function Page({
  params,
}: {
  params: Promise<{ dersId: string }>;
}) {
  const { dersId } = await params;
  return <ExamsPage courseId={dersId} kind="PRACTICE" />;
}
