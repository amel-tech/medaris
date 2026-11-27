"use client";

import type {
  OnlineExamResultsResponse,
  ResultsTalebeResponse,
} from "@medaris/services/tedrisat";
import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { useToaster } from "@medaris/ui/mds/toast";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { releaseExamResults } from "~/features/evaluation/actions";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import { closeExamEarly, readExamResults } from "../results-actions";

type Results = OnlineExamResultsResponse;

/** How often the page reads the results again while the exam is open. */
export const RESULTS_REFRESH_MS = 30_000;

const failedCode = (result: unknown): string | null =>
  typeof result === "object" &&
  result !== null &&
  "success" in result &&
  result.success === false &&
  "code" in result
    ? String(result.code)
    : null;

/**
 * What "Sınavı erken bitir" and a release draw before tedrisat answers: no one
 * is in the exam any more, and the ones who were are finished by the team.
 * Their scores come with the read that follows.
 */
export const closedNow = (results: Results, at: Date): Results => {
  const ended = results.talebe.filter((r) => r.state === "IN_PROGRESS").length;
  return {
    ...results,
    exam: {
      ...results.exam,
      closed: true,
      mayClose: false,
      closedEarlyAt: at,
    },
    talebe: results.talebe.map((r) =>
      r.state === "IN_PROGRESS"
        ? {
            ...r,
            state: "FINISHED",
            finishedBy: "CLOSED_EARLY",
            finishedAt: at,
          }
        : r.state === "NOT_STARTED"
          ? { ...r, state: "MISSED" }
          : r
    ),
    counts: {
      ...results.counts,
      inProgress: 0,
      finished: results.counts.finished + ended,
      missed: results.counts.seats - results.counts.started,
    },
  };
};

/**
 * Whether the exam has opened, as tedrisat's read says it: it has closed for
 * everyone, or it may be closed early, which is "it has opened" while it has
 * not closed (`mayCloseEarly`). The release waits for it: it ends the exam
 * for everyone, and tedrisat refuses it before (EXAM_NOT_OPEN).
 */
export const hasOpened = (results: Results): boolean =>
  results.exam.closed || results.exam.mayClose;

/**
 * One online exam's results for the course team (MDRS-299,
 * nazar.exams.results): the talebe, the topics, the questions and the zeroth
 * question, "Sınavı erken bitir" and "Sonuçları talebelere aç", which ends
 * the exam for everyone as the early close does. While the exam is open the
 * page reads again every 30 seconds. Both writes show at once and are put
 * back, with a toast, when tedrisat refuses them.
 */
export function ResultsView({ initial }: { initial: Results }) {
  const t = useTranslations("nazar");
  const locale = useLocale();
  const timeZone = useTimeZone();
  const { notify } = useToaster();
  const [results, setResults] = useState(initial);
  const [asking, setAsking] = useState<"close" | "release" | null>(null);
  // A read that lands while a write is on its way would draw over it.
  const writing = useRef(0);

  const when = (at: Date | string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone,
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(at));
  const clock = (at: Date | string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).format(new Date(at));

  const examId = results.exam.id;
  const open = !results.exam.closed;
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(async () => {
      if (writing.current > 0) return;
      const fresh = await readExamResults(examId);
      if (writing.current > 0) return;
      if ("success" in fresh && fresh.success) setResults(fresh.data);
    }, RESULTS_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [open, examId]);

  const refused = (title: string, code: string | null) =>
    notify({
      tone: "error",
      title,
      description:
        code === "EXAM_NOT_OPEN"
          ? t("ExamResults.notOpen")
          : code === "AUTHZ_FORBIDDEN"
            ? t("Problems.actionForbidden")
            : t("Problems.actionGeneric"),
    });

  const close = async () => {
    setAsking(null);
    const before = results;
    setResults(closedNow(before, new Date()));
    writing.current += 1;
    try {
      const result = await closeExamEarly(examId);
      if (handleUnauthenticated(result)) return;
      const code = failedCode(result);
      if (code !== null) {
        setResults(before);
        refused(t("ExamResults.closeFailed"), code);
        return;
      }
      notify({ tone: "success", title: t("ExamResults.closedToast") });
      const fresh = await readExamResults(examId);
      if ("success" in fresh && fresh.success) setResults(fresh.data);
    } catch {
      setResults(before);
      refused(t("ExamResults.closeFailed"), null);
    } finally {
      writing.current -= 1;
    }
  };

  const release = async () => {
    setAsking(null);
    const before = results;
    const at = new Date();
    // The release ends an exam still open for everyone, as the early close.
    const ended = before.exam.closed ? before : closedNow(before, at);
    setResults({ ...ended, released: true, releasedAt: at });
    writing.current += 1;
    try {
      const result = await releaseExamResults(before.exam.lessonId);
      if (handleUnauthenticated(result)) return;
      const code = failedCode(result);
      if (code !== null) {
        setResults(before);
        refused(t("Evaluation.releaseFailed"), code);
        return;
      }
      notify({ tone: "success", title: t("Evaluation.releasedToast") });
      const fresh = await readExamResults(examId);
      if ("success" in fresh && fresh.success) setResults(fresh.data);
    } catch {
      setResults(before);
      refused(t("Evaluation.releaseFailed"), null);
    } finally {
      writing.current -= 1;
    }
  };

  const zerothText = new Map(results.zeroth.options.map((o) => [o.id, o.text]));
  const stateOf = (row: ResultsTalebeResponse) => {
    if (row.state === "FINISHED") {
      if (row.finishedBy === "TIME") return t("ExamResults.stateTimeUp");
      if (row.finishedBy === "CLOSED_EARLY")
        return t("ExamResults.stateClosedEarly");
      return t("ExamResults.stateFinished");
    }
    if (row.state === "IN_PROGRESS") return t("ExamResults.stateInProgress");
    if (row.state === "MISSED") return t("ExamResults.stateMissed");
    return t("ExamResults.stateNotStarted");
  };
  const percent = (value: number | null) =>
    value === null
      ? t("ExamResults.none")
      : t("ExamResults.percent", { percent: value });
  const count = (value: number | null) =>
    value === null ? t("ExamResults.none") : String(value);

  const talebeColumns: TableColumn<ResultsTalebeResponse>[] = [
    {
      key: "name",
      header: t("ExamResults.colTalebe"),
      rowHeader: true,
      // A talebe who started opens their answers (the owner, 22 Nov 2026:
      // "talebeye tıklayıp hangi soruya ne cevap verdiğini ayrıca görebilmek").
      render: (row) =>
        row.state === "IN_PROGRESS" || row.state === "FINISHED" ? (
          <a
            className="mds-link"
            href={`/ders/${results.exam.courseId}/sinavlar/${results.exam.id}/sonuclar/${row.userId}`}
            aria-label={t("ExamAnswers.openLabel", {
              name: row.name ?? t("ExamResults.unnamed"),
            })}
          >
            {row.name ?? t("ExamResults.unnamed")}
          </a>
        ) : (
          (row.name ?? t("ExamResults.unnamed"))
        ),
    },
    {
      key: "state",
      header: t("ExamResults.colState"),
      render: (row) => (
        <Badge
          variant={row.state === "IN_PROGRESS" ? "brand" : "secondary"}
          // One width for every state, so the column lines up (MDRS-248);
          // nazar has only the system's spacing steps, so 20 (80px), not 24.
          className="min-inline-20 justify-center"
        >
          {stateOf(row)}
        </Badge>
      ),
    },
    {
      key: "score",
      header: t("ExamResults.colScore"),
      align: "right",
      render: (row) => row.score ?? t("ExamResults.none"),
    },
    {
      key: "right",
      header: t("ExamResults.colRight"),
      align: "right",
      render: (row) => count(row.right),
    },
    {
      key: "wrong",
      header: t("ExamResults.colWrong"),
      align: "right",
      render: (row) => count(row.wrong),
    },
    {
      key: "blank",
      header: t("ExamResults.colBlank"),
      align: "right",
      render: (row) => count(row.blank),
    },
    {
      key: "switches",
      header: t("ExamResults.colSwitches"),
      render: (row) =>
        row.switches.length === 0 ? (
          t("ExamResults.noSwitch")
        ) : (
          <span className="flex flex-col">
            <span>
              {t("ExamResults.switchCount", { count: row.switches.length })}
            </span>
            <span className="mds-caption">
              {row.switches.map((s) => clock(s.at)).join(", ")}
            </span>
          </span>
        ),
    },
    {
      key: "zeroth",
      header: t("ExamResults.colZeroth"),
      render: (row) =>
        row.zerothOptionId === null ? (
          t("ExamResults.noZeroth")
        ) : (
          <span dir="auto">
            {zerothText.get(row.zerothOptionId) ?? t("ExamResults.none")}
          </span>
        ),
    },
  ];

  const { counts } = results;
  return (
    <div className="flex flex-col gap-section">
      <section className="flex flex-col gap-2" aria-labelledby="results-state">
        <h2 id="results-state" className="mds-visually-hidden">
          {t("ExamResults.title")}
        </h2>
        <p className="mds-body-sm text-neutral-muted">
          {t("ExamResults.window", {
            startsAt: when(results.exam.startsAt),
            latestStartAt: when(results.exam.latestStartAt),
          })}
        </p>
        <p className="mds-body" aria-live="polite">
          {open ? t("ExamResults.liveNote") : t("ExamResults.closedNote")}
        </p>
        <p className="mds-body">
          {counts.started === 0
            ? t("ExamResults.noAttemptYet")
            : t("ExamResults.countsLine", {
                seats: counts.seats,
                started: counts.started,
                inProgress: counts.inProgress,
                finished: counts.finished,
                missed: counts.missed,
              })}
        </p>
        {counts.average !== null ? (
          <p className="mds-body">
            {t("ExamResults.averageLine", { average: counts.average })}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {results.exam.mayClose ? (
            <Button variant="outline" onClick={() => setAsking("close")}>
              {t("ExamResults.closeEarly")}
            </Button>
          ) : null}
          {results.released ? (
            <Badge variant="success">
              {results.releasedAt
                ? t("ExamResults.releasedLine", {
                    releasedAt: when(results.releasedAt),
                  })
                : t("Evaluation.released")}
            </Badge>
          ) : results.mayRelease && results.releasable && hasOpened(results) ? (
            <Button onClick={() => setAsking("release")}>
              {t("Evaluation.release")}
            </Button>
          ) : (
            <span className="mds-body-sm text-neutral-muted">
              {t("ExamResults.releaseHint")}
            </span>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="results-talebe">
        <h2 id="results-talebe" className="mds-h2">
          {t("ExamResults.talebeTitle")}
        </h2>
        <Table
          caption={t("ExamResults.talebeTitle")}
          columns={talebeColumns}
          rows={results.talebe}
          rowKey={(row) => row.userId}
          empty={t("ExamResults.noTalebe")}
          responsive="stack"
        />
      </section>

      {results.topics.length > 0 ? (
        <section
          className="flex flex-col gap-3"
          aria-labelledby="results-topics"
        >
          <h2 id="results-topics" className="mds-h2">
            {t("ExamResults.topicsTitle")}
          </h2>
          <Table
            caption={t("ExamResults.topicsTitle")}
            rows={results.topics}
            rowKey={(row) => row.topicId}
            responsive="stack"
            columns={[
              {
                key: "topic",
                header: t("ExamResults.colTopic"),
                rowHeader: true,
                render: (row) =>
                  t("ExamResults.topicName", {
                    number: row.number,
                    name: row.name,
                  }),
              },
              {
                key: "percent",
                header: t("ExamResults.colAverage"),
                align: "right",
                render: (row) => percent(row.percent),
              },
              {
                key: "questions",
                header: t("ExamResults.colQuestions"),
                align: "right",
                render: (row) => String(row.questionCount),
              },
            ]}
          />
        </section>
      ) : null}

      <section
        className="flex flex-col gap-3"
        aria-labelledby="results-questions"
      >
        <h2 id="results-questions" className="mds-h2">
          {t("ExamResults.questionsTitle")}
        </h2>
        <ol className="flex flex-col gap-3">
          {results.questions.map((q) => (
            <li key={q.questionId} className="mds-card flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <strong>
                  {t("ExamResults.questionNumber", { number: q.number })}
                </strong>
                <span className="mds-body-sm text-neutral-muted">
                  {t("ExamResults.questionLine", {
                    points: q.points,
                    right: percent(q.rightPercent),
                    blank: q.blank,
                  })}
                </span>
              </div>
              <p className="mds-body" dir="auto">
                {q.text}
              </p>
              <ul className="mds-body-sm flex flex-col gap-1">
                {q.options.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-2">
                    <span dir="auto">
                      {t("ExamResults.optionChosen", {
                        option: o.text,
                        chosen: o.chosen,
                      })}
                    </span>
                    {o.correct ? (
                      <Badge variant="success">
                        {t("ExamResults.correctBadge")}
                      </Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="results-zeroth">
        <h2 id="results-zeroth" className="mds-h2">
          {t("ExamResults.zerothTitle")}
        </h2>
        <p className="mds-body" dir="auto">
          {results.zeroth.question}
        </p>
        <p className="mds-body-sm text-neutral-muted">
          {t("ExamResults.zerothNoScore")}
        </p>
        <ul className="mds-body-sm flex flex-col gap-1">
          {results.zeroth.options.map((o) => (
            <li key={o.id} dir="auto">
              {t("ExamResults.zerothOptionCount", {
                option: o.text,
                count: o.count,
              })}
            </li>
          ))}
        </ul>
      </section>

      <AlertDialog
        open={asking === "close"}
        onOpenChange={(next) => setAsking(next ? "close" : null)}
        title={t("ExamResults.closeEarlyTitle")}
        confirmLabel={t("ExamResults.closeEarlyConfirm")}
        cancelLabel={t("ExamResults.cancel")}
        closeLabel={t("Shell.close")}
        confirmVariant="destructive"
        onConfirm={close}
      >
        {t("ExamResults.closeEarlyBody", { inProgress: counts.inProgress })}
      </AlertDialog>
      <AlertDialog
        open={asking === "release"}
        onOpenChange={(next) => setAsking(next ? "release" : null)}
        title={t("ExamResults.releaseConfirmTitle")}
        confirmLabel={t("ExamResults.releaseConfirm")}
        cancelLabel={t("ExamResults.cancel")}
        closeLabel={t("Shell.close")}
        onConfirm={release}
      >
        {open ? <p>{t("ExamResults.releaseEndsExam")}</p> : null}
        {counts.inProgress > 0 ? (
          <p>
            {t("ExamResults.releaseStillIn", { inProgress: counts.inProgress })}
          </p>
        ) : null}
        <p>{t("ExamResults.releaseConfirmBody")}</p>
      </AlertDialog>
    </div>
  );
}
