import type { Metadata } from "next";
import { CourseNazirsPage } from "~/features/course-nazirs/components/course-nazirs-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazar.CourseNazirs");
  return { title: t("title") };
}

/** Ders nazırları of a course; it wins over the shared placeholder's `[bolum]`. */
export default async function Page({
  params,
}: {
  params: Promise<{ dersId: string }>;
}) {
  const { dersId } = await params;
  return <CourseNazirsPage courseId={dersId} />;
}
