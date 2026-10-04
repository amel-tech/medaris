import type { Metadata } from "next";
import { CurriculumPage } from "~/features/curriculum-hide/components/curriculum-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazir.Curriculum");
  return { title: t("title") };
}

/**
 * Müfredat of a course: the page that hides a week or a session (MDRS-143). It
 * wins over the shared placeholder's `[bolum]` and is absorbed by the editor
 * (MDRS-123), which owns this address from then on.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ dersId: string }>;
}) {
  const { dersId } = await params;
  return <CurriculumPage courseId={dersId} />;
}
