import type { Metadata } from "next";
import { CourseOverviewPage } from "~/features/course-overview/components/course-overview-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazar.Nav");
  return { title: t("ders.overview") };
}

/** Genel bakış of a course: its name, its state and its waiting work. */
export default async function Page({
  params,
}: {
  params: Promise<{ dersId: string }>;
}) {
  const { dersId } = await params;
  return <CourseOverviewPage courseId={dersId} />;
}
