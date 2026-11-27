import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getMyPracticeSets } from "~/features/practice/reads";
import { MyNotesPage } from "~/features/question-notes/components/my-notes-page";
import { notesCourseOf } from "~/features/question-notes/note-model";
import { getMyQuestionNotes } from "~/features/question-notes/reads";

// Behind the sign-in middleware (not in `publicPages`), and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tedris.QuestionNotes");
  return { title: `${t("notesTitle")} | Tedris` };
}

/**
 * "Notlarım" of a course (MDRS-248, soru notları): `?ders=<courseId>`, from
 * the course's link on Çalışma Soruları and the "Hocan notunu cevapladı"
 * notification. The course's name comes from the talebe's sets; a course
 * with exams only is drawn without it.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ders?: string | string[] }>;
}) {
  const courseId = notesCourseOf(await searchParams);
  if (!courseId) return <MyNotesPage read={null} courseTitle={null} />;
  const [read, sets] = await Promise.all([
    getMyQuestionNotes(courseId),
    getMyPracticeSets(),
  ]);
  const courseTitle =
    sets?.find((s) => s.courseId === courseId)?.courseTitle ?? null;
  return <MyNotesPage read={read} courseTitle={courseTitle} />;
}
