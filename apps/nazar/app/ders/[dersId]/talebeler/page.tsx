import type { Metadata } from "next";
import { EnrolmentsPage } from "~/features/enrolments/components/enrolments-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazar.CourseStudents");
  return { title: t("title") };
}

/** Talebeler of a course; it wins over the shared placeholder's `[bolum]`. */
export default async function Page({
  params,
}: {
  params: Promise<{ dersId: string }>;
}) {
  const { dersId } = await params;
  return <EnrolmentsPage courseId={dersId} />;
}
