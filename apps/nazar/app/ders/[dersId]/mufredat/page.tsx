import type { Metadata } from "next";
import { CurriculumPage } from "~/features/curriculum/components/curriculum-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazar.Curriculum");
  return { title: t("title") };
}

/** Müfredat of a course; it wins over the shared placeholder's `[bolum]`. */
export default async function Page({
  params,
}: {
  params: Promise<{ dersId: string }>;
}) {
  const { dersId } = await params;
  return <CurriculumPage courseId={dersId} />;
}
