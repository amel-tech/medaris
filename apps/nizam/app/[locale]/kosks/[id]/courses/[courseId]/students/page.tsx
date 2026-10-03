import { ArrowLeftIcon } from "@medaris/icons/ssr";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { mayBanWholeKosk, nextSessionAt } from "~/features/bans/present";
import {
  getCourse,
  getCourseEnrollments,
  getKoskById,
  getMe,
} from "~/features/kosks/actions";
import { CourseRoster } from "~/features/kosks/components/course-roster";

/** The course team's roster (MDRS-105). */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string; courseId: string }>;
}) {
  const { id, courseId } = await params;
  const [kosk, course, enrollments, me] = await Promise.all([
    getKoskById(id),
    getCourse(courseId),
    getCourseEnrollments(courseId),
    getMe(),
  ]);
  if (!kosk || !course || course.koskId !== kosk.id) notFound();
  const t = await getTranslations("nizam.CourseTeam");

  return (
    <div className="mx-auto max-w-6xl py-8">
      <Link
        href={`/kosks/${kosk.id}/courses/${course.id}/edit`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <ArrowLeftIcon size={14} /> {t("back")}
      </Link>
      <div className="mb-6 border-b pb-5">
        <h1 className="text-2xl font-bold tracking-tight">
          {t("rosterTitle")}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {t("rosterSubtitle", { course: course.title })}
        </p>
      </div>
      {enrollments === null ? (
        <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          {t("unavailable")}
        </p>
      ) : (
        <CourseRoster
          koskId={kosk.id}
          koskName={kosk.name}
          courseId={course.id}
          courseTitle={course.title}
          enrollments={enrollments}
          mayBanKosk={mayBanWholeKosk(me, kosk.id)}
          nextSessionAt={
            nextSessionAt(course, new Date())?.toISOString() ?? null
          }
        />
      )}
    </div>
  );
}
