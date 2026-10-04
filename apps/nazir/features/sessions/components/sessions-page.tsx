import { Button } from "@medaris/ui/mds/button";
import { Icon } from "@medaris/ui/mds/icon";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import {
  DEFAULT_TIME_ZONE,
  resolveTimeZone,
  timeZoneCity,
} from "@medaris/utils";
import { getLocale } from "next-intl/server";
import { getViewer } from "~/features/account/reads";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import { planHref, sessionFacts, streamsOf } from "../sessions";
import { SessionsTable } from "./sessions-table";

/**
 * Celseler: every session of the course by date, "Yaklaşan" and
 * "Geçmiş", with the times on the viewer's clock. The course read is the page's
 * probe: `GET /courses/:id` answers every signed-in caller, but strips the
 * programme's content (links, agendas) from anyone who is not course staff, and
 * says so with `contentLocked`; that is the "Bu sayfaya izniniz yok" state
 * here, as a 403 is on the other pages. The live stream links are a side read:
 * tedrisat answers 403 to whoever does not hold `session.live_link`, and then
 * the "Canlı yayın" column and buttons are left out. The writes carry the
 * course version of this read.
 */
export async function SessionsPage({ courseId }: { courseId: string }) {
  const [t, locale, me, course, streams] = await Promise.all([
    getMessages("nazir"),
    getLocale(),
    getViewer(),
    readOnce("the course", (api) =>
      api.courses.getCourseById({ id: courseId })
    ),
    readOnce("the course's live stream links", (api) =>
      api.lessons.listCourseLiveStreams({ id: courseId })
    ),
  ]);
  const timeZone = resolveTimeZone(me?.timeZone, DEFAULT_TIME_ZONE);
  const problem =
    course.status !== "ok"
      ? course.status
      : course.data.contentLocked
        ? "forbidden"
        : null;

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-inline-measure flex-col gap-1">
          <h1 className="mds-h1">{t("Sessions.title")}</h1>
          {course.status === "ok" ? (
            <p className="mds-body-sm text-neutral-muted">
              {t("Sessions.subtitle", {
                name: course.data.title,
                zone:
                  timeZone === DEFAULT_TIME_ZONE
                    ? t("Sessions.zoneIstanbul")
                    : timeZoneCity(timeZone),
              })}
            </p>
          ) : null}
        </div>
        {course.status === "ok" && problem === null ? (
          <Button
            href={planHref(courseId)}
            iconLeft={<Icon name="plus" size="sm" />}
          >
            {t("Sessions.plan")}
          </Button>
        ) : null}
      </header>
      {course.status !== "ok" || problem !== null ? (
        <PageProblem
          status={problem === "forbidden" ? "forbidden" : "failed"}
          failed={{
            title: t("Sessions.loadFailedTitle"),
            text: t("Sessions.loadFailed"),
          }}
        />
      ) : (
        <SessionsTable
          courseId={courseId}
          version={course.data.version}
          facts={sessionFacts(course.data)}
          streams={streams.status === "ok" ? streamsOf(streams.data) : null}
          locale={locale}
          timeZone={timeZone}
        />
      )}
    </>
  );
}

/** The page while the course is read: the shell stays, and the table is bars. */
export async function SessionsLoading() {
  const t = await getMessages("nazir.Shell");
  return (
    <output className="flex flex-col gap-section" aria-busy="true">
      <span className="mds-visually-hidden">{t("loadingLabel")}</span>
      <Skeleton width="12rem" height="2.5rem" />
      {[0, 1, 2, 3, 4].map((row) => (
        <Skeleton key={row} height="3rem" />
      ))}
    </output>
  );
}
