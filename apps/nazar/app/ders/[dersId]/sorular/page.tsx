import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isUuid } from "~/features/courses/courses";
import { QuestionsPage } from "~/features/questions/components/questions-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazar.Questions");
  return { title: t("title") };
}

/** Sorular of a course (MDRS-150); it wins over the shared placeholder's `[bolum]`. */
export default async function Page({
  params,
}: {
  params: Promise<{ dersId: string }>;
}) {
  const { dersId } = await params;
  if (!isUuid(dersId)) notFound();
  return <QuestionsPage courseId={dersId} />;
}
