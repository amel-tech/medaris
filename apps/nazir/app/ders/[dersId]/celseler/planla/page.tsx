import type { Metadata } from "next";
import { PlanPage } from "~/features/sessions/components/plan-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazir.SessionPlan");
  return { title: t("title") };
}

/** Celse planla: one session or a weekly repeat, under the course's Celseler. */
export default async function Page({
  params,
}: {
  params: Promise<{ dersId: string }>;
}) {
  const { dersId } = await params;
  return <PlanPage courseId={dersId} />;
}
