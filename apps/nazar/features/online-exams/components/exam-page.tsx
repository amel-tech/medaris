import type { ExamKind } from "@medaris/services/tedrisat";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import { DEFAULT_TIME_ZONE, resolveTimeZone } from "@medaris/utils";
import { redirect } from "next/navigation";
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
import { NOTES_ANCHOR } from "../question-notes";
import { ExamWorkspace } from "./exam-workspace";

/**
 * One online exam (MDRS-299): while a draft, the course's topics, the exam's
 * questions and "Yayınla"; once published, the exam read-only with when it
 * opens. Times are on the viewer's clock. With `kind: PRACTICE` it is one
 * çalışma seti under "Çalışma Soruları" (MDRS-248); an id of the other kind
 * is sent to the page of its own. A published set also shows how it was
 * solved, and once a talebe finished it, that it can no longer be unpublished.
 * Both end with "Talebe notları" (MDRS-248), a side read: the notes the
 * talebe sent to the hoca, which the page goes on without when it fails.
 */
export async function ExamPage({
  courseId,
  examId,
  kind = "EXAM",
}: {
  courseId: string;
  examId: string;
  kind?: ExamKind;
}) {
  const practice = kind === "PRACTICE";
  const [t, locale, me, draft, permissions, stats, notes] = await Promise.all([
    getMessages("nazar"),
    getLocale(),
    getViewer(),
    readOnce("the online exam", (api) =>
      api.onlineExams.getOnlineExamDraft({ examId })
    ),
    readCoursePermissions(courseId),
    // A side read: how the set was solved. Missing, the page goes on without it.
    practice
      ? readOnce("the course's practice set stats", (api) =>
          api.practice.listPracticeSetStats({ id: courseId })
        )
      : null,
    readOnce("the set's talebe notes", (api) =>
      api.questionNotes.listExamQuestionNotes({ examId })
    ),
  ]);
  const gate = pageGate([draft], permissions, PAGE_CODES.exams);
  if (draft.status !== "ok" || gate !== "ok") {
    return (
      <>
        <h1 className="mds-h1">
          {practice ? t("Practice.title") : t("OnlineExams.title")}
        </h1>
        <PageProblem
          status={gate === "forbidden" ? "forbidden" : "failed"}
          failed={{
            title: practice
              ? t("Practice.loadFailedTitle")
              : t("OnlineExams.loadFailedTitle"),
            text: t("OnlineExams.loadFailed"),
          }}
        />
      </>
    );
  }
  if (draft.data.kind !== kind) {
    redirect(`/ders/${courseId}/${segmentOf(draft.data.kind)}/${examId}`);
  }
  return (
    <>
      <header className="flex max-inline-measure flex-col gap-1">
        <a
          className="mds-link mds-body-sm"
          href={`/ders/${courseId}/${segmentOf(kind)}`}
        >
          {practice ? t("Practice.backToList") : t("OnlineExams.backToList")}
        </a>
        <h1 className="mds-h1">{draft.data.title}</h1>
        {!practice && draft.data.status !== "DRAFT" ? (
          <a
            className="mds-link mds-body-sm"
            href={`/ders/${courseId}/sinavlar/${examId}/sonuclar`}
          >
            {t("ExamResults.link")}
          </a>
        ) : null}
        {(draft.data.unansweredNotes ?? 0) > 0 ? (
          <a className="mds-link mds-body-sm" href={`#${NOTES_ANCHOR}`}>
            {t("QuestionNotes.headerLink", {
              count: draft.data.unansweredNotes ?? 0,
            })}
          </a>
        ) : null}
      </header>
      <ExamWorkspace
        key={draft.data.id}
        courseId={courseId}
        draft={draft.data}
        timeZone={resolveTimeZone(me?.timeZone, DEFAULT_TIME_ZONE)}
        locale={locale}
        practiceStats={
          stats?.status === "ok"
            ? (stats.data.find((s) => s.setId === examId) ?? null)
            : undefined
        }
        notes={notes.status === "ok" ? notes.data : null}
      />
    </>
  );
}

export async function ExamLoading() {
  const t = await getMessages("nazar.Shell");
  return (
    <output className="flex flex-col gap-section" aria-busy="true">
      <span className="mds-visually-hidden">{t("loadingLabel")}</span>
      <Skeleton width="16rem" height="2.5rem" />
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} height="6rem" />
      ))}
    </output>
  );
}
