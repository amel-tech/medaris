import type { Metadata } from "next";
import { CourseSettingsPage } from "~/features/course-settings/components/course-settings-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazar.CourseSettings");
  return { title: t("title") };
}

/** Ders ayarları of a course; it wins over the shared placeholder's `[bolum]`. */
export default async function Page({
  params,
}: {
  params: Promise<{ dersId: string }>;
}) {
  const { dersId } = await params;
  return <CourseSettingsPage courseId={dersId} />;
}
