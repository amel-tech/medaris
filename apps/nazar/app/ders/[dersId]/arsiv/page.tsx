import type { Metadata } from "next";
import { pageOf } from "~/features/archive/archive";
import { CourseArchivePage } from "~/features/course-archive/components/course-archive-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazar.CourseArchive");
  return { title: t("title") };
}

/** Arşiv of a course (MDRS-143); it wins over the shared placeholder's `[bolum]`. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ dersId: string }>;
  searchParams: Promise<{ tur?: string | string[]; sayfa?: string | string[] }>;
}) {
  const { dersId } = await params;
  const { tur, sayfa } = await searchParams;
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  return (
    <CourseArchivePage
      courseId={dersId}
      tabParam={first(tur)}
      page={pageOf(first(sayfa))}
    />
  );
}
