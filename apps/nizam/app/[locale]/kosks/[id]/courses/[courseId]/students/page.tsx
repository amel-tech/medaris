import { Icon } from "@medaris/ui/mds/icon";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { StudentsTabs } from "~/features/applications/components/students-tabs";
import { toRow } from "~/features/applications/present";
import { mayBanWholeKosk, nextSessionAt } from "~/features/bans/present";
import {
  getCourse,
  getCourseEnrollments,
  getKoskById,
  getMe,
} from "~/features/kosks/actions";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.StudentsPage");
  return { title: t("title") };
}

/**
 * A course's Talebeler (design nizam/57, with the roster of MDRS-105 behind
 * its tabs): the waiting applications first, then the enrolled and the
 * talebe who completed the course.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string; courseId: string }>;
}) {
  const { locale, id, courseId } = await params;
  setRequestLocale(locale);
  const [kosk, course, enrollments, me] = await Promise.all([
    getKoskById(id),
    getCourse(courseId),
    getCourseEnrollments(courseId),
    getMe(),
  ]);
  if (!kosk || !course || course.koskId !== kosk.id) notFound();
  const t = await getTranslations("nizam.StudentsPage");
  const unnamed = (await getTranslations("nizam.ApplicationsPage"))("unnamed");

  return (
    <>
      <header className="flex flex-col gap-3">
        <Link
          href={`/${locale}/kosks/${kosk.id}/courses/${course.id}/edit`}
          className="mds-caption inline-flex items-center gap-1.5 no-underline"
        >
          <Icon name="arrowLeft" size="sm" /> {t("back")}
        </Link>
        <h1 className="mds-h1">{t("title")}</h1>
        <p className="max-w-[48rem]">
          {t("subtitle", { course: course.title })}
        </p>
      </header>
      {enrollments === null ? (
        <p className="mds-caption">{t("unavailable")}</p>
      ) : (
        <StudentsTabs
          koskId={kosk.id}
          koskName={kosk.name}
          courseId={course.id}
          courseTitle={course.title}
          requiresApproval={course.requiresApproval}
          applications={enrollments
            .filter((e) => e.status === "PENDING")
            .map((e) =>
              toRow(
                { ...e, courseTitle: course.title },
                course.muderris.map((m) => m.name),
                unnamed
              )
            )}
          roster={enrollments.filter((e) => e.status !== "PENDING")}
          mayBanKosk={mayBanWholeKosk(me, kosk.id)}
          nextSessionAt={
            nextSessionAt(course, new Date())?.toISOString() ?? null
          }
        />
      )}
    </>
  );
}
