import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  getCourse,
  getCourseEnrollments,
  getKoskById,
} from "~/features/kosks/actions";
import { CourseOverview } from "~/features/kosks/components/course-overview";
import {
  getCourseStats,
  getKoskCourseRoster,
} from "~/features/kosks/overview-reads";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.CourseOverview");
  return { title: t("title") };
}

/**
 * Genel bakış (design nizam/53): one course for its köşk nazımı. The numbers
 * are read first because their route asks for the course team's right: a
 * caller outside it, or a course that is not there, gets the "Bu bölüm için
 * izniniz yok" screen (nizam/06), the 403 and the 404 looking the same on
 * purpose. A course that belongs to another köşk is not found here.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string; courseId: string }>;
}) {
  const { locale, id, courseId } = await params;
  setRequestLocale(locale);
  const [kosk, course, stats, enrollments, roster] = await Promise.all([
    getKoskById(id),
    getCourse(courseId),
    getCourseStats(courseId),
    getCourseEnrollments(courseId),
    getKoskCourseRoster(id),
  ]);

  if (stats === "forbidden") forbidden();
  if (stats === "not-found") notFound();
  if (!kosk || !course || course.koskId !== kosk.id) notFound();

  return (
    <div className="mx-auto w-full max-w-[72rem]">
      <CourseOverview
        kosk={{ id: kosk.id, name: kosk.name }}
        course={course}
        stats={stats}
        pending={
          enrollments ? enrollments.filter((e) => e.status === "PENDING") : null
        }
        row={
          roster && typeof roster === "object"
            ? (roster.items.find((r) => r.id === course.id) ?? null)
            : null
        }
      />
    </div>
  );
}
