import type { Metadata } from "next";
import { OpenCoursePage } from "~/features/courses/components/open-course-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazir.OpenCourse");
  return { title: t("title") };
}

/** Medrese dersi aç (nazir 08), under Dersler. */
export default async function Page({
  params,
}: {
  params: Promise<{ medreseId: string }>;
}) {
  const { medreseId } = await params;
  return <OpenCoursePage madrasahId={medreseId} />;
}
