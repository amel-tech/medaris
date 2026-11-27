"use client";

import type {
  TalebeAnswerQuestionResponse,
  TalebeAnswersResponse,
} from "@medaris/services/tedrisat";
import { Badge } from "@medaris/ui/mds/badge";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { boxDir } from "../arabic";
import { ArabicText } from "./arabic-text";

/**
 * One talebe's answers, question by question in the exam's order: each
 * option with the talebe's choice and the correct ones marked, and the points
 * the answer earned. A choice is marked by a check and by words, never by
 * color alone; "Doğru" is the editor's badge.
 */
export function TalebeAnswersView({
  answers,
}: {
  answers: TalebeAnswersResponse;
}) {
  const t = useTranslations("nazar");
  const locale = useLocale();
  const timeZone = useTimeZone();
  const clock = (at: Date | string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).format(new Date(at));

  const ended =
    answers.state === "IN_PROGRESS"
      ? t("ExamResults.stateInProgress")
      : answers.finishedBy === "TIME"
        ? t("ExamResults.stateTimeUp")
        : answers.finishedBy === "CLOSED_EARLY"
          ? t("ExamResults.stateClosedEarly")
          : t("ExamResults.stateFinished");

  return (
    <div className="flex flex-col gap-section">
      <section
        className="mds-card flex flex-col gap-2 p-4"
        aria-labelledby="answers-summary"
      >
        <h2 id="answers-summary" className="mds-h3">
          {t("ExamAnswers.summaryTitle")}
        </h2>
        <p className="mds-body-sm flex flex-wrap items-center gap-2">
          <Badge
            variant={answers.state === "IN_PROGRESS" ? "brand" : "secondary"}
          >
            {ended}
          </Badge>
          {answers.score === null
            ? t("ExamAnswers.noScore")
            : t("ExamAnswers.score", { score: answers.score })}
        </p>
        <p className="mds-body-sm">
          {answers.switches.length === 0
            ? t("ExamAnswers.noSwitch")
            : t("ExamAnswers.switches", {
                count: answers.switches.length,
                times: answers.switches.map((s) => clock(s.at)).join(", "),
              })}
        </p>
        <p className="mds-body-sm">
          {t("ExamAnswers.zeroth")}{" "}
          {answers.zeroth.answer === null ? (
            t("ExamResults.noZeroth")
          ) : (
            <ArabicText text={answers.zeroth.answer} />
          )}
        </p>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="answers-list">
        <h2 id="answers-list" className="mds-h2">
          {t("ExamAnswers.questionsTitle")}
        </h2>
        {answers.questions.length === 0 ? (
          <p className="mds-body-sm text-neutral-muted">
            {t("ExamAnswers.noQuestions")}
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {answers.questions.map((q) => (
              <li key={q.questionId}>
                <AnswerCard question={q} />
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function AnswerCard({ question }: { question: TalebeAnswerQuestionResponse }) {
  const t = useTranslations("nazar");
  const verdict =
    question.verdict === "RIGHT"
      ? { variant: "success" as const, text: t("ExamAnswers.verdictRight") }
      : question.verdict === "WRONG"
        ? { variant: "error" as const, text: t("ExamAnswers.verdictWrong") }
        : {
            variant: "secondary" as const,
            text: question.skipped
              ? t("ExamAnswers.verdictSkipped")
              : t("ExamAnswers.verdictBlank"),
          };
  return (
    <article className="mds-card flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <strong>
          {t("OnlineExams.questionNumber", { number: question.number })}
        </strong>
        <Badge variant={verdict.variant}>{verdict.text}</Badge>
        <span className="mds-body-sm text-neutral-muted">
          {t("ExamAnswers.earned", {
            earned: question.earned,
            points: question.points,
          })}
        </span>
      </div>
      <p className="mds-body" dir={boxDir(question.text) ?? "auto"}>
        <ArabicText text={question.text} />
      </p>
      {/* The list stays left to right with its letter on the left; each
          option's text is its own run, and the marks are never inside it. */}
      <ol className="mds-body-sm flex flex-col gap-1" type="A">
        {question.options.map((o) => (
          <li key={o.id}>
            {o.chosen ? (
              <>
                <strong>
                  <span aria-hidden="true">✓ </span>
                  <ArabicText text={o.text} />
                </strong>{" "}
                <span className="mds-caption">{t("ExamAnswers.chosen")}</span>
              </>
            ) : (
              <ArabicText text={o.text} />
            )}
            {o.correct ? (
              <>
                {" "}
                <Badge variant="success">{t("OnlineExams.correct")}</Badge>
              </>
            ) : null}
          </li>
        ))}
      </ol>
    </article>
  );
}
