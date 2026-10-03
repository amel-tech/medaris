import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { env } from "~/env";
import { CourseLoadFailed } from "~/features/courses/components/course-load-failed";
import { SessionsView } from "~/features/courses/components/sessions-view";
import { recordingCounts } from "~/features/courses/present";
import { getRecordings, readCourseScope } from "~/features/courses/reads";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.Sessions");
  return { title: t("title") };
}

/**
 * Celseler (design nizam/56): every session of a course by date, for the
 * köşk's manager and the course's müderris.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string; courseId: string }>;
}) {
  const { locale, id, courseId } = await params;
  setRequestLocale(locale);
  const [scope, recordings] = await Promise.all([
    readCourseScope(id, courseId),
    getRecordings(courseId),
  ]);
  if (scope.kind === "missing") notFound();
  if (scope.kind === "denied") forbidden();
  if (scope.kind === "failed") return <CourseLoadFailed />;

  return (
    <div className="mx-auto w-full max-w-[72rem]">
      <SessionsView
        kosk={{ id: scope.kosk.id, name: scope.kosk.name }}
        course={scope.course}
        recordings={Object.fromEntries(recordingCounts(recordings))}
        tedrisUrl={env.TEDRIS_URL || null}
      />
    </div>
  );
}
