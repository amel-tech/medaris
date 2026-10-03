import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CourseLoadFailed } from "~/features/courses/components/course-load-failed";
import { SessionPlanForm } from "~/features/courses/components/session-plan-form";
import { readCourseScope } from "~/features/courses/reads";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.SessionPlan");
  return { title: t("title") };
}

/**
 * Celse planla (design nizam/55): one session or a weekly repeat for a course,
 * for the köşk's manager and the course's müderris.
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
      <SessionPlanForm
        kosk={{ id: scope.kosk.id, name: scope.kosk.name }}
        course={{
          id: scope.course.id,
          title: scope.course.title,
          timeZone: scope.course.timeZone,
        }}
      />
    </div>
  );
}
