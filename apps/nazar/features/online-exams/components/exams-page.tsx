import type { OnlineExamSummaryResponse } from "@medaris/services/tedrisat";
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
import { CourseZerothSection } from "./course-zeroth-section";
import { NewExamForm } from "./new-exam-form";

/**
 * "Sınavlar" of a course (MDRS-299): its online exams, "Yeni sınav", and the
 * zeroth question its exams ask. Opens with `exam.prepare`.
 */
export async function ExamsPage({ courseId }: { courseId: string }) {
  const [t, locale, me, exams, permissions, zeroth] = await Promise.all([
    getMessages("nazar"),
    getLocale(),
    getViewer(),
    readOnce("the course's online exams", (api) =>
      api.onlineExams.listOnlineExams({ id: courseId })
    ),
    readCoursePermissions(courseId),
    readOnce("the course's zeroth question", (api) =>
      api.onlineExams.getCourseZerothQuestion({ id: courseId })
    ),
  ]);
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
    exam.status === "SCHEDULED" ? (
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
        <h1 className="mds-h1">{t("OnlineExams.title")}</h1>
        <p className="mds-body-sm text-neutral-muted">
          {t("OnlineExams.intro")}
        </p>
      </header>
      {exams.status !== "ok" || gate !== "ok" ? (
        <PageProblem
          status={gate === "forbidden" ? "forbidden" : "failed"}
          failed={{
            title: t("OnlineExams.loadFailedTitle"),
            text: t("OnlineExams.loadFailed"),
          }}
        />
      ) : (
        <>
          <NewExamForm courseId={courseId} />
          {exams.data.length === 0 ? (
            <p className="mds-body-sm text-neutral-muted">
              {t("OnlineExams.none")}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {exams.data.map((exam) => (
                <li key={exam.id}>
                  <a
                    className="mds-link"
                    href={`/ders/${courseId}/sinavlar/${exam.id}`}
                  >
                    {exam.title}
                  </a>{" "}
                  <span className="mds-body-sm text-neutral-muted">
                    {t("OnlineExams.questionCount", {
                      count: exam.questionCount,
                    })}
                  </span>{" "}
                  {status(exam)}
                </li>
              ))}
            </ul>
          )}
          {/* A side read: if it fails, its place says so and the list stays. */}
          {zeroth.status === "ok" ? (
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
