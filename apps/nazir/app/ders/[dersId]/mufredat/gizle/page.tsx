import type { Metadata } from "next";
import { CurriculumPage } from "~/features/curriculum-hide/components/curriculum-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazir.Curriculum");
  return { title: t("title") };
}

/**
 * The page that hides a week or a session by its own routes (MDRS-143,
 * `week.hide`): it keeps its screen for whoever holds `week.hide` but not the
 * right to save the whole course, now that the editor owns `/mufredat`.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ dersId: string }>;
}) {
  const { dersId } = await params;
  return <CurriculumPage courseId={dersId} />;
}
