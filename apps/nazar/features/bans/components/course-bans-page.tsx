import type { MadrasahBanResponse } from "@medaris/services/tedrisat";
import { DEFAULT_TIME_ZONE, resolveTimeZone } from "@medaris/utils";
import { getLocale } from "next-intl/server";
import { getViewer } from "~/features/account/reads";
import { ALL } from "~/features/courses/courses";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getMessages } from "~/lib/i18n/messages";
import { type Read, readOnce } from "~/lib/tedrisat-read";
import {
  type BanStatus,
  banRows,
  courseBansPath,
  ofCourse,
  talebeOf,
} from "../bans";
import { BansTable } from "./bans-table";
import { CourseBanButton } from "./course-ban-dialog";

const STATUSES: readonly BanStatus[] = ["ACTIVE", "LIFTED"];

/**
 * Yasaklamalar of one course: its course bans, active or lifted, in the
 * medrese's table. A medrese's course reads the medrese's list narrowed to
 * the course (`GET /madrasahs/:id/bans?courseId=`); a course with no medrese
 * reads its köşk's list (`GET /kosks/:koskId/bans`, which has no course
 * filter) and keeps this course's rows. Both tabs are read, so each count is
 * the course's own. "Yasakla" offers only this course's talebe, from its
 * roster, and bars them from this course (`POST /courses/:courseId/bans`).
 */
export async function CourseBansPage({
  courseId,
  status,
}: {
  courseId: string;
  status: BanStatus;
}) {
  const [t, locale, me, course, roster] = await Promise.all([
    getMessages("nazar"),
    getLocale(),
    getViewer(),
    readOnce("the course", (api) =>
      api.courses.getCourseById({ id: courseId })
    ),
    readOnce("the course's roster", (api) =>
      api.courses.getCourseEnrollments({ id: courseId })
    ),
  ]);
  const title = <h1 className="mds-h1">{t("Bans.title")}</h1>;
  const failed = {
    title: t("Bans.loadFailedTitle"),
    text: t("Bans.loadFailed"),
  };
  if (course.status !== "ok") {
    return (
      <>
        {title}
        <PageProblem status={course.status} failed={failed} />
      </>
    );
  }

  const madrasah = course.data.madrasah ?? null;
  const lists: Read<MadrasahBanResponse[]>[] = await Promise.all(
    STATUSES.map(async (each) => {
      if (madrasah) {
        const read = await readOnce("the course's bans", (api) =>
          api.bans.listMadrasahBans({
            id: madrasah.id,
            status: each,
            courseId,
          })
        );
        return read.status === "ok"
          ? { status: "ok" as const, data: read.data.items }
          : read;
      }
      const read = await readOnce("the köşk's bans", (api) =>
        api.bans.listKoskBans({ koskId: course.data.koskId, status: each })
      );
      return read.status === "ok"
        ? { status: "ok" as const, data: ofCourse(read.data.items, courseId) }
        : read;
    })
  );
  const [active, lifted] = lists;
  const problem = lists.find((read) => read.status !== "ok");
  const talebe =
    roster.status === "ok"
      ? talebeOf(roster.data, locale, t("Nazirs.unknownPerson"))
      : [];
  const courseTitle = course.data.title;
  const shown = status === "ACTIVE" ? active : lifted;

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        {title}
        {problem ? null : (
          <CourseBanButton
            courseId={courseId}
            courseTitle={courseTitle}
            talebe={talebe}
            disabledReason={
              roster.status !== "ok"
                ? t("CourseBans.rosterFailed")
                : talebe.length === 0
                  ? t("CourseBans.noTalebe")
                  : null
            }
          />
        )}
      </header>
      {problem ? (
        <PageProblem status={problem.status} failed={failed} />
      ) : (
        <BansTable
          path={courseBansPath(courseId)}
          scopeName={courseTitle}
          rows={banRows(shown.status === "ok" ? shown.data : [], t, {
            locale,
            timeZone: resolveTimeZone(me?.timeZone, DEFAULT_TIME_ZONE),
            now: new Date(),
            madrasahName: madrasah?.name ?? "",
            viewerId: me?.id,
          })}
          filters={{ status, scope: ALL }}
          tabs={[
            {
              status: "ACTIVE",
              count: active.status === "ok" ? active.data.length : 0,
            },
            {
              status: "LIFTED",
              count: lifted.status === "ok" ? lifted.data.length : 0,
            },
          ]}
        />
      )}
    </>
  );
}
