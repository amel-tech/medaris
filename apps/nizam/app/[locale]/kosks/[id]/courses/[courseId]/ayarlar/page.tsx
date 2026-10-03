import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { env } from "~/env";
import { CourseLoadFailed } from "~/features/courses/components/course-load-failed";
import { CourseSettingsPage } from "~/features/courses/components/course-settings-page";
import { readCourseScope } from "~/features/courses/reads";
import { getCourseStats } from "~/features/kosks/overview-reads";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.CourseSettings");
  return { title: t("title") };
}

/**
 * Ders ayarları (design nizam/34): access, enrolment, time zone, publication,
 * team and "Dersi gizle" of one course, for the köşk's manager and the
 * course's müderris. The number of talebe the "Taslağa çek" note names is the
 * course stats' own; without it the note says it without a number.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string; courseId: string }>;
}) {
  const { locale, id, courseId } = await params;
  setRequestLocale(locale);
  const [scope, stats] = await Promise.all([
    readCourseScope(id, courseId),
    getCourseStats(courseId),
  ]);
  if (scope.kind === "missing") notFound();
  if (scope.kind === "denied") forbidden();
  if (scope.kind === "failed") return <CourseLoadFailed />;

  return (
    <div className="mx-auto w-full max-w-[72rem]">
      <CourseSettingsPage
        kosk={scope.kosk}
        course={scope.course}
        enrolledCount={
          stats && typeof stats === "object" ? stats.enrolledCount : null
        }
        manager={scope.manager}
        tedrisUrl={env.TEDRIS_URL || null}
      />
    </div>
  );
}
