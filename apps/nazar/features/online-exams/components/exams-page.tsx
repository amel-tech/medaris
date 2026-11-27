import type {
  ExamKind,
  OnlineExamSummaryResponse,
} from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Badge } from "@medaris/ui/mds/badge";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import { DEFAULT_TIME_ZONE, resolveTimeZone } from "@medaris/utils";
import { getLocale } from "next-intl/server";
import {
  PAGE_CODES,
  pageGate,
  readCoursePermissions,
} from "~/features/account/course-permissions";
import { getViewer } from "~/features/account/reads";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import { segmentOf } from "../online-exams";
import { CourseZerothSection } from "./course-zeroth-section";
import { NewExamForm } from "./new-exam-form";

/**
 * "Sınavlar" of a course (MDRS-299): its online exams, "Yeni sınav", and the
 * zeroth question its exams ask. Opens with `exam.prepare`. With
 * `kind: PRACTICE` it is "Çalışma Soruları" (MDRS-248): the course's
 * çalışma setleri and "Yeni çalışma seti", with no results and no zeroth
 * question, since a set has neither. Beside each published set, how many
 * talebe solved it, how many times, and their average percentage (Faz 4);
 * a side read, so the list stays when it fails.
 */
export async function ExamsPage({
  courseId,
  kind = "EXAM",
}: {
  courseId: string;
  kind?: ExamKind;
}) {
  const practice = kind === "PRACTICE";
  const [t, locale, me, exams, permissions, zeroth, stats] = await Promise.all([
    getMessages("nazar"),
    getLocale(),
    getViewer(),
    readOnce("the course's online exams", (api) =>
      api.onlineExams.listOnlineExams(
        practice ? { id: courseId, kind: "PRACTICE" } : { id: courseId }
      )
    ),
    readCoursePermissions(courseId),
    practice
      ? null
      : readOnce("the course's zeroth question", (api) =>
          api.onlineExams.getCourseZerothQuestion({ id: courseId })
        ),
    practice
      ? readOnce("the course's practice set stats", (api) =>
          api.practice.listPracticeSetStats({ id: courseId })
        )
      : null,
  ]);
  const statsOf = new Map(
    stats?.status === "ok" ? stats.data.map((s) => [s.setId, s]) : []
  );
  const percent = (value: string) =>
    new Intl.NumberFormat(locale, {
      style: "percent",
      maximumFractionDigits: 2,
    }).format(Number(value) / 100);
  const solved = (exam: OnlineExamSummaryResponse) => {
    if (!practice || exam.status === "DRAFT" || stats?.status !== "ok") {
      return null;
    }
    const s = statsOf.get(exam.id);
    return (
      <span
        className="mds-body-sm text-neutral-muted"
        data-testid="practice-set-stats"
      >
        {" · "}
        {s
          ? t("Practice.stats", {
              talebe: s.talebeCount,
              count: s.attemptCount,
              percent:
                s.averagePercent === null ? "" : percent(s.averagePercent),
            })
          : t("Practice.statsNone")}
      </span>
    );
  };
  const segment = segmentOf(kind);
  const gate = pageGate([exams], permissions, PAGE_CODES.exams);
  const timeZone = resolveTimeZone(me?.timeZone, DEFAULT_TIME_ZONE);
  const when = (at: Date | null) =>
    at
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone,
        }).format(new Date(at))
      : "";
  const status = (exam: OnlineExamSummaryResponse) =>
    practice ? (
      exam.status === "DRAFT" ? (
        <Badge variant="secondary">{t("Practice.statusDraft")}</Badge>
      ) : (
        <Badge variant="success">{t("Practice.statusOpen")}</Badge>
      )
    ) : exam.status === "SCHEDULED" ? (
      <Badge variant="brand">
        {t("OnlineExams.statusScheduled", { when: when(exam.startsAt) })}
      </Badge>
    ) : exam.status === "OPEN" ? (
      <Badge variant="success">{t("OnlineExams.statusOpen")}</Badge>
    ) : exam.status === "CLOSED" ? (
      <Badge variant="outline">{t("OnlineExams.statusClosed")}</Badge>
    ) : (
      <Badge variant="secondary">{t("OnlineExams.statusDraft")}</Badge>
    );
  return (
    <>
      <header className="flex max-inline-measure flex-col gap-1">
        <h1 className="mds-h1">
          {practice ? t("Practice.title") : t("OnlineExams.title")}
        </h1>
        <p className="mds-body-sm text-neutral-muted">
          {practice ? t("Practice.intro") : t("OnlineExams.intro")}
        </p>
      </header>
      {exams.status !== "ok" || gate !== "ok" ? (
        <PageProblem
          status={gate === "forbidden" ? "forbidden" : "failed"}
          failed={{
            title: practice
              ? t("Practice.loadFailedTitle")
              : t("OnlineExams.loadFailedTitle"),
            text: t("OnlineExams.loadFailed"),
          }}
        />
      ) : (
        <>
          <NewExamForm courseId={courseId} kind={kind} />
          {exams.data.length === 0 ? (
            <p className="mds-body-sm text-neutral-muted">
              {practice ? t("Practice.none") : t("OnlineExams.none")}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {exams.data.map((exam) => (
                <li key={exam.id}>
                  <a
                    className="mds-link"
                    href={`/ders/${courseId}/${segment}/${exam.id}`}
                  >
                    {exam.title}
                  </a>{" "}
                  <span className="mds-body-sm text-neutral-muted">
                    {practice
                      ? t("Practice.questionCount", {
                          count: exam.questionCount,
                        })
                      : t("OnlineExams.questionCount", {
                          count: exam.questionCount,
                        })}
                  </span>{" "}
                  {status(exam)}
                  {solved(exam)}
                  {!practice && exam.status !== "DRAFT" ? (
                    <>
                      {" · "}
                      <a
                        className="mds-link mds-body-sm"
                        href={`/ders/${courseId}/sinavlar/${exam.id}/sonuclar`}
                        aria-label={t("ExamResults.linkLabel", {
                          title: exam.title,
                        })}
                      >
                        {t("ExamResults.link")}
                      </a>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {/* A side read: if it fails, its place says so and the list stays. */}
          {zeroth === null ? null : zeroth.status === "ok" ? (
            <CourseZerothSection courseId={courseId} initial={zeroth.data} />
          ) : (
            <Alert tone="error" title={t("OnlineExams.zeroth.title")}>
              <p>{t("OnlineExams.zeroth.loadFailed")}</p>
            </Alert>
          )}
        </>
      )}
    </>
  );
}

export async function ExamsLoading() {
  const t = await getMessages("nazar.Shell");
  return (
    <output className="flex flex-col gap-section" aria-busy="true">
      <span className="mds-visually-hidden">{t("loadingLabel")}</span>
      <Skeleton width="12rem" height="2.5rem" />
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} height="2rem" />
      ))}
    </output>
  );
}
