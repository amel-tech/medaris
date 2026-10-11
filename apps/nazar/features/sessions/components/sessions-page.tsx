import { Button } from "@medaris/ui/mds/button";
import { Icon } from "@medaris/ui/mds/icon";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import {
  DEFAULT_TIME_ZONE,
  resolveTimeZone,
  timeZoneCity,
} from "@medaris/utils";
import { getLocale } from "next-intl/server";
import {
  CODES,
  holds,
  PAGE_CODES,
  pageGate,
  readCoursePermissions,
} from "~/features/account/course-permissions";
import { getViewer } from "~/features/account/reads";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import { releasesOf } from "../../recordings/recordings";
import { planHref, sessionFacts, streamsOf } from "../sessions";
import { SessionsTable } from "./sessions-table";

/**
 * Celseler: every session of the course by date, "Yaklaşan" and
 * "Geçmiş", with the times on the viewer's clock. The page opens for a caller
 * who holds `session.manage` or `session.live_link` in this course, read from
 * `GET /courses/:id/my-permissions`; anyone else gets "Bu sayfaya izniniz
 * yok", and a permissions read that failed is the retry state. Each control is
 * drawn for the code it needs (`SessionsTable`), and the API still decides
 * every write. The live stream links are read only for a holder of
 * `session.live_link`; when that read fails its buttons are left out, while
 * "Katılım" still says which sessions are streamed, from the course read
 * (MDRS-283). The course's recordings are read so a session that is over can
 * say "Kayıt yok"; when that read fails nothing is said of them. The writes
 * carry the course version of this read.
 *
 * "Kayıt erişimi" (MDRS-288), when talebe may watch a session's recording,
 * is set here too, before the recording exists, by a holder of
 * `recording.manage`, on the course's clock; the time is read from the course.
 */
export async function SessionsPage({ courseId }: { courseId: string }) {
  const [t, locale, me, course, permissions] = await Promise.all([
    getMessages("nazar"),
    getLocale(),
    getViewer(),
    readOnce("the course", (api) =>
      api.courses.getCourseById({ id: courseId })
    ),
    readCoursePermissions(courseId),
  ]);
  const timeZone = resolveTimeZone(me?.timeZone, DEFAULT_TIME_ZONE);
  const gate = pageGate([course], permissions, PAGE_CODES.sessions);
  const held = permissions.status === "ok" ? permissions.data : null;
  const canManage = held !== null && holds(held, CODES.sessionManage);
  const [streams, recordings] =
    gate === "ok"
      ? await Promise.all([
          held !== null && holds(held, CODES.sessionLiveLink)
            ? readOnce("the course's live stream links", (api) =>
                api.lessons.listCourseLiveStreams({ id: courseId })
              )
            : null,
          readOnce("the course's recordings", (api) =>
            api.lessons.listCourseRecordings({ id: courseId })
          ),
        ])
      : [null, null];

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
        {gate === "ok" && canManage ? (
          <Button
            href={planHref(courseId)}
            iconLeft={<Icon name="plus" size="sm" />}
          >
            {t("Sessions.plan")}
          </Button>
        ) : null}
      </header>
      {course.status !== "ok" || gate !== "ok" ? (
        <PageProblem
          status={gate === "forbidden" ? "forbidden" : "failed"}
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
          canManage={canManage}
          streams={streams?.status === "ok" ? streamsOf(streams.data) : null}
          courseInPerson={course.data.inPerson}
          recorded={
            recordings?.status === "ok"
              ? recordings.data.map((recording) => recording.lessonId)
              : null
          }
          releases={releasesOf(course.data)}
          canRelease={held !== null && holds(held, CODES.recordingManage)}
          locale={locale}
          timeZone={timeZone}
          courseTimeZone={resolveTimeZone(
            course.data.timeZone,
            DEFAULT_TIME_ZONE
          )}
        />
      )}
    </>
  );
}

/** The page while the course is read: the shell stays, and the table is bars. */
export async function SessionsLoading() {
  const t = await getMessages("nazar.Shell");
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
