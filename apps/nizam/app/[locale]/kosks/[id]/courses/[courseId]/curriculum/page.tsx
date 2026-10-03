import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CourseLoadFailed } from "~/features/courses/components/course-load-failed";
import { CurriculumEditor } from "~/features/courses/components/curriculum-editor";
import { readCourseScope } from "~/features/courses/reads";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.Curriculum");
  return { title: t("title") };
}

/**
 * Müfredat (design nizam/54): a course's details, weeks and sessions for the
 * köşk's manager and the course's müderris. Anyone else, or a course of
 * another köşk, gets the "Bu bölüm için izniniz yok" screen (nizam/06).
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string; courseId: string }>;
}) {
  const { locale, id, courseId } = await params;
  setRequestLocale(locale);
  const scope = await readCourseScope(id, courseId);
  if (scope.kind === "missing") notFound();
  if (scope.kind === "denied") forbidden();
  if (scope.kind === "failed") return <CourseLoadFailed />;

  return (
    <div className="mx-auto w-full max-w-[72rem]">
      <CurriculumEditor
        kosk={{ id: scope.kosk.id, name: scope.kosk.name }}
        course={scope.course}
      />
    </div>
  );
}
