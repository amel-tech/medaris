import type { Metadata } from "next";
import { HomeworkPage } from "~/features/homework/components/homework-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazar.Homework");
  return { title: t("title") };
}

/** Ödevler of a course (MDRS-290); it wins over the shared placeholder's `[bolum]`. */
export default async function Page({
  params,
}: {
  params: Promise<{ dersId: string }>;
}) {
  const { dersId } = await params;
  return <HomeworkPage courseId={dersId} />;
}
