import {
  BookOpenIcon,
  CalendarBlankIcon,
  PencilSimpleIcon,
  PlayCircleIcon,
  PlusIcon,
} from "@medaris/icons/ssr";
import type {
  CourseSummaryResponse,
  KoskResponse,
  PendingEnrollmentResponse,
} from "@medaris/services/tedrisat";
import { Badge } from "@medaris/ui/components/badge";
import { Button } from "@medaris/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@medaris/ui/components/card";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { KoskFormDialog } from "~/features/kosks/components/kosk-form-dialog";
import { PendingRequests } from "~/features/kosks/components/pending-requests";
import type { KoskAbilities } from "~/features/kosks/kosk-abilities";

/**
 * A köşk's page in nizam. Each button is there only when `abilities` says
 * the viewer may call what it calls (MDRS-108); a course card links to the
 * editor only for the courses in `editableCourseIds`.
 */
export async function KoskDetailPage({
  kosk,
  courses,
  abilities,
  editableCourseIds,
  pendingEnrollments = [],
}: {
  kosk: KoskResponse;
  courses: CourseSummaryResponse[];
  abilities: KoskAbilities;
  editableCourseIds: ReadonlySet<string>;
  pendingEnrollments?: PendingEnrollmentResponse[];
}) {
  const t = await getTranslations("nizam");
  const anyButton =
    abilities.reviewRequests || abilities.edit || abilities.openCourse;
  const cardLink = (courseId: string, card: ReactNode) =>
    editableCourseIds.has(courseId) ? (
      <Link
        key={courseId}
        href={`/kosks/${kosk.id}/courses/${courseId}/edit`}
        className="block"
      >
        {card}
      </Link>
    ) : (
      <div key={courseId}>{card}</div>
    );

  return (
    <div className="py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold">{kosk.name}</h1>
          <p className="text-muted-foreground mt-2">
            {t("KoskDetail.subtitle")}
          </p>
        </div>
        {anyButton && (
          <div className="flex items-center gap-2">
            {abilities.reviewRequests && (
              <PendingRequests koskId={kosk.id} requests={pendingEnrollments} />
            )}
            {abilities.edit && (
              <KoskFormDialog
                kosk={kosk}
                trigger={
                  <Button variant="outline" size="lg" className="gap-2">
                    <PencilSimpleIcon className="w-5 h-5" />
                    {t("KoskDetail.editKosk")}
                  </Button>
                }
              />
            )}
            {abilities.openCourse && (
              <Button
                asChild
                size="lg"
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              >
                <Link href={`/kosks/${kosk.id}/courses/new`}>
                  <PlusIcon className="w-5 h-5" />
                  {t("KoskDetail.newCourse")}
                </Link>
              </Button>
            )}
          </div>
        )}
      </div>

      {courses.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) =>
            cardLink(
              course.id,
              <Card className="overflow-hidden group pt-0 h-full transition-all hover:shadow-lg">
                <div
                  className="relative h-40 w-full"
                  style={{
                    background: `linear-gradient(135deg, oklch(0.94 0.04 ${course.coverHue}) 0%, oklch(0.88 0.07 ${course.coverHue}) 100%)`,
                  }}
                >
                  <div className="absolute right-3 top-3">
                    <Badge
                      variant={
                        course.status === "PUBLISHED" ? "default" : "secondary"
                      }
                    >
                      {course.status === "PUBLISHED"
                        ? t("KoskDetail.published")
                        : t("KoskDetail.draft")}
                    </Badge>
                  </div>
                </div>
                <CardHeader>
                  <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                    {course.category && (
                      <span className="font-semibold">{course.category}</span>
                    )}
                    {course.category && (
                      <span className="size-[3px] rounded-full bg-muted-foreground/50" />
                    )}
                    <span>{t(`Levels.${course.level}`)}</span>
                  </div>
                  <CardTitle className="line-clamp-1 text-lg">
                    {course.title}
                  </CardTitle>
                  {course.subtitle && (
                    <CardDescription className="line-clamp-2">
                      {course.subtitle}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <CalendarBlankIcon className="w-4 h-4" />
                      <span>
                        {t("KoskDetail.weeks", { count: course.weekCount })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <PlayCircleIcon className="w-4 h-4" />
                      <span>
                        {t("KoskDetail.lessons", { count: course.lessonCount })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <BookOpenIcon className="w-4 h-4" />
                      <span>
                        {t("KoskDetail.resources", {
                          count: course.resourceCount,
                        })}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          )}
        </div>
      ) : (
        <div className="text-center py-12 border-2 border-dashed rounded-lg bg-muted/30">
          <h3 className="text-lg font-medium text-muted-foreground">
            {t("KoskDetail.noCoursesTitle")}
          </h3>
          <p className="text-sm text-muted-foreground/80 mt-1">
            {abilities.openCourse
              ? t("KoskDetail.noCoursesDescription")
              : t("KoskDetail.noCoursesReadOnly")}
          </p>
        </div>
      )}
    </div>
  );
}
