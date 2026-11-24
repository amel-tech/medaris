import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TeacherNotePage } from "~/features/teacher-note/components/teacher-note-page";
import { getMessages } from "~/lib/i18n/messages";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazar.TeacherNote");
  return { title: t("title") };
}

/** Ders notu of one session of a course. */
export default async function Page({
  params,
}: {
  params: Promise<{ dersId: string; celseId: string }>;
}) {
  const { dersId, celseId } = await params;
  if (!UUID.test(celseId)) notFound();
  return <TeacherNotePage courseId={dersId} lessonId={celseId} />;
}
