import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { Card } from "@medaris/ui/mds/card";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Icon } from "@medaris/ui/mds/icon";
import { DEFAULT_TIME_ZONE, resolveTimeZone } from "@medaris/utils";
import { getLocale } from "next-intl/server";
import { env } from "~/env";
import { BADGE_VARIANT } from "~/features/account/assignments-view";
import {
  CODES,
  holds,
  readCoursePermissions,
} from "~/features/account/course-permissions";
import { coursePageUrl } from "~/features/course-settings/course-settings";
import { awaitingReview, rowOf } from "~/features/homework/homework";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import { nextSessionAt, overviewBoxes } from "../course-overview";

/**
 * Genel bakış of a course: its name, whether it is published, "Tedris’te aç",
 * and the course's waiting work as boxes that each open their section. The
 * numbers are the menu's (`GET /courses/:id/badge-counts`: the applications
 * waiting and the sessions ahead nobody can join), the homework not reviewed
 * yet is read only for a holder of `submission.read`
 * (`GET /courses/:id/submissions`, as Ödevler reads it), and the next session
 * comes from the course read. A number that could not be read (a nazır the
 * count endpoint refuses) draws no box rather than a zero.
 */
export async function CourseOverviewPage({ courseId }: { courseId: string }) {
  const [t, locale, course, counts, permissions] = await Promise.all([
    getMessages("nazar"),
    getLocale(),
    readOnce("the course", (api) =>
      api.courses.getCourseById({ id: courseId })
    ),
    readOnce("the course's badge counts", (api) =>
      api.courses.getCourseBadgeCounts({ id: courseId })
    ),
    readCoursePermissions(courseId),
  ]);

  if (course.status !== "ok") {
    return (
      <>
        <h1 className="mds-h1">{t("Nav.ders.overview")}</h1>
        <PageProblem
          status={course.status === "forbidden" ? "forbidden" : "failed"}
          failed={{
            title: t("CourseOverview.loadFailedTitle"),
            text: t("CourseOverview.loadFailed"),
          }}
        />
      </>
    );
  }

  const homework =
    permissions.status === "ok" && holds(permissions.data, CODES.submissionRead)
      ? await readOnce("the course's homework", (api) =>
          api.submissions.listCourseSubmissions({ id: courseId })
        )
      : null;
  const published = course.data.status === "PUBLISHED";
  const pageUrl = coursePageUrl(env.TEDRIS_URL, course.data.id);
  const boxes = overviewBoxes(
    courseId,
    {
      applications:
        counts.status === "ok" ? counts.data.pendingApplications : null,
      homework:
        homework?.status === "ok"
          ? awaitingReview(homework.data.items.map(rowOf))
          : null,
      withoutAccess:
        counts.status === "ok" ? counts.data.sessionsWithoutAccess : null,
      nextSession: nextSessionAt(course.data, new Date()),
    },
    {
      locale,
      timeZone: resolveTimeZone(course.data.timeZone, DEFAULT_TIME_ZONE),
    }
  );

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="mds-h1 flex flex-wrap items-center gap-3">
          <bdi>{course.data.title}</bdi>
          <Badge
            variant={BADGE_VARIANT[published ? "published" : "draft"]}
            data-testid="course-status"
          >
            {t(`Account.scopeBadge.${published ? "published" : "draft"}`)}
          </Badge>
        </h1>
        {pageUrl ? (
          <Button
            href={pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="outline"
            iconRight={<Icon name="externalLink" size="sm" />}
          >
            {t("CourseOverview.openInTedris")}
            <span className="mds-visually-hidden">
              {" "}
              {t("CourseOverview.openInTedrisHint")}
            </span>
          </Button>
        ) : null}
      </header>
      {boxes.length === 0 ? (
        <EmptyState>{t("CourseOverview.empty")}</EmptyState>
      ) : (
        <ul
          aria-label={t("CourseOverview.listLabel")}
          className="grid gap-grid md:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]"
          data-testid="overview-boxes"
        >
          {boxes.map((box) => (
            <li key={box.id} className="flex">
              <Card
                className="flex-1"
                href={box.href}
                title={t(`CourseOverview.boxes.${box.id}`)}
              >
                <p className="mds-h2 tabular-nums">
                  {typeof box.value === "number"
                    ? new Intl.NumberFormat(locale).format(box.value)
                    : box.value}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
