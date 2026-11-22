import type {
  MyAnsweredQuestionResponse,
  MyExamResultResponse,
} from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import Link from "next/link";
import { getLocale, getTimeZone, getTranslations } from "next-intl/server";
import type { LooseTranslator } from "~/lib/i18n/loose";
import { scoreText, takeHref } from "../my-exams-model";
import type { MyResultRead } from "../my-reads";

// Narrow on purpose: the full translator type hits TS2589 (MDRS-176).
type Translate = LooseTranslator;

const OUTCOME: Record<MyAnsweredQuestionResponse["outcome"], string> = {
  RIGHT: "outcomeRight",
  WRONG: "outcomeWrong",
  BLANK: "outcomeBlank",
};

const OUTCOME_BADGE = {
  RIGHT: "success",
  WRONG: "error",
  BLANK: "secondary",
} as const;

/**
 * A talebe's own screen of a past online exam (MDRS-299,
 * `graphs/tedris/exams/result`), on one page: when and how it ended; once the
 * course team released the results, the score, the counts, the standing in
 * each topic of the exam and across the course, the weakest first; once the
 * exam has also closed for everyone, "Cevaplarım" with the correct options.
 */
export async function MyExamResult({ read }: { read: MyResultRead }) {
  const t: Translate = (await getTranslations("tedrisLearn.MyExams")) as never;
  const locale = await getLocale();
  const timeZone = await getTimeZone();
  const when = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  });

  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      <nav aria-label={t("breadcrumbLabel")} className="mds-caption">
        <Link className="mds-btn mds-btn--link" href={`/my-exams`}>
          {t("pageTitle")}
        </Link>
      </nav>
      {read.status === "ok" ? (
        <Result
          result={read.result}
          t={t}
          at={(value) => when.format(new Date(value))}
          locale={locale}
        />
      ) : (
        <Alert
          tone={read.status === "absent" ? "neutral" : "error"}
          title={t(
            read.status === "absent"
              ? "resultNotFoundTitle"
              : "resultFailedTitle"
          )}
        >
          <p>
            {t(read.status === "absent" ? "resultNotFound" : "resultFailed")}
          </p>
          {read.status === "failed" ? (
            <p className="mbs-3">
              <Button variant="outline" size="small" href="">
                {t("retry")}
              </Button>
            </p>
          ) : null}
        </Alert>
      )}
    </main>
  );
}

function Result({
  result,
  t,
  at,
  locale,
}: {
  result: MyExamResultResponse;
  t: Translate;
  at: (value: Date | string) => string;
  locale: string;
}) {
  const heading = (
    <div className="flex flex-col gap-2">
      <p className="mds-caption" dir="auto">
        {result.courseTitle}
      </p>
      <h1 className="mds-h1" dir="auto">
        {result.title}
      </h1>
    </div>
  );

  if (result.status === "IN_PROGRESS") {
    return (
      <>
        {heading}
        <Alert tone="neutral" title={t("inProgressTitle")}>
          <p>{t("inProgress")}</p>
          <p className="mbs-3">
            <Button size="small" href={takeHref(result)}>
              {t("continue")}
            </Button>
          </p>
        </Alert>
      </>
    );
  }

  const ended = result.finishedAt ? at(result.finishedAt) : "";
  const endedLine =
    result.finishedBy === "TIME"
      ? t("handedInByTime", { at: ended })
      : result.finishedBy === "CLOSED_EARLY"
        ? t("handedInByTeam", { at: ended })
        : t("handedIn", { at: ended });

  return (
    <>
      {heading}
      <section
        className="mds-card flex flex-col gap-2"
        aria-labelledby="my-result-score"
        data-testid="my-result"
      >
        <p className="mds-body-sm text-neutral-muted">{endedLine}</p>
        {result.released && result.score !== null && result.counts ? (
          <>
            <h2 id="my-result-score" className="mds-h2">
              {t("scoreOutOf", { score: scoreText(result.score, locale) })}
            </h2>
            <p className="mds-body">
              {t("counts", {
                right: result.counts.right,
                wrong: result.counts.wrong,
                blank: result.counts.blank,
              })}
            </p>
          </>
        ) : (
          <>
            <h2 id="my-result-score" className="mds-h2">
              {t("notReleased")}
            </h2>
            <p className="mds-body-sm">{t("notReleasedHint")}</p>
          </>
        )}
      </section>

      {result.released && result.topics.length > 0 ? (
        <section
          className="flex flex-col gap-3"
          aria-labelledby="my-result-topics"
        >
          <h2 id="my-result-topics" className="mds-h2">
            {t("byTopic")}
          </h2>
          <ul className="flex flex-col gap-2">
            {result.topics.map((topic) => {
              const name = t("topicName", {
                number: topic.number,
                name: topic.name,
              });
              return (
                <li key={topic.topicId} className="flex flex-col gap-1">
                  <span className="mds-body" dir="auto">
                    {name}
                  </span>
                  <progress
                    className="mds-progress"
                    max={100}
                    value={topic.percent}
                    aria-label={t("topicBarLabel", {
                      topic: name,
                      percent: topic.percent,
                    })}
                  />
                  <span className="mds-body-sm text-neutral-muted">
                    {t("topicLine", {
                      percent: topic.percent,
                      right: topic.right,
                      wrong: topic.wrong,
                      blank: topic.blank,
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {result.released && result.courseTopics.length > 0 ? (
        <section
          className="flex flex-col gap-3"
          aria-labelledby="my-result-course-topics"
        >
          <h2 id="my-result-course-topics" className="mds-h2">
            {t("courseTopics")}
          </h2>
          <p className="mds-body-sm text-neutral-muted">
            {t("courseTopicsIntro")}
          </p>
          <ul className="flex flex-col gap-1">
            {result.courseTopics.map((topic) => (
              <li key={topic.topicId} className="mds-body-sm" dir="auto">
                {t("topicName", { number: topic.number, name: topic.name })}
                {" · "}
                {t("courseTopicLine", {
                  percent: topic.percent,
                  exams: topic.exams,
                })}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {result.released ? (
        <section
          className="flex flex-col gap-3"
          aria-labelledby="my-result-answers"
        >
          <h2 id="my-result-answers" className="mds-h2">
            {t("myAnswers")}
          </h2>
          {result.questions === null ? (
            <p className="mds-body-sm">{t("answersLater")}</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {result.questions.map((q) => (
                <li key={q.id}>
                  <AnsweredQuestion question={q} t={t} locale={locale} />
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}
    </>
  );
}

function AnsweredQuestion({
  question,
  t,
  locale,
}: {
  question: MyAnsweredQuestionResponse;
  t: Translate;
  locale: string;
}) {
  return (
    <article className="mds-card flex flex-col gap-2" data-testid="my-answer">
      <div className="flex flex-wrap items-center gap-2">
        <strong>{t("questionNumber", { number: question.number })}</strong>
        <Badge variant={OUTCOME_BADGE[question.outcome]}>
          {t(OUTCOME[question.outcome])}
        </Badge>
        <span className="mds-body-sm text-neutral-muted">
          {t("pointsGot", {
            got: scoreText(question.got, locale),
            points: scoreText(question.points, locale),
          })}
        </span>
      </div>
      <p className="mds-body" dir="auto">
        {question.text}
      </p>
      <ul className="flex flex-col gap-1">
        {question.options.map((o) => (
          <li
            key={o.id}
            className="mds-body-sm flex flex-wrap items-center gap-2"
            data-chosen={o.chosen ? "true" : undefined}
            data-correct={o.correct ? "true" : undefined}
          >
            <span dir="auto">{o.text}</span>
            {o.chosen ? <Badge variant="info">{t("chosen")}</Badge> : null}
            {o.correct ? (
              <Badge variant="success">{t("correctOption")}</Badge>
            ) : null}
          </li>
        ))}
      </ul>
      {question.outcome === "BLANK" ? (
        <p className="mds-body-sm text-neutral-muted">{t("noAnswer")}</p>
      ) : null}
    </article>
  );
}
