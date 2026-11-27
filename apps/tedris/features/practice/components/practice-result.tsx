import type {
  PracticeAttemptResponse,
  PracticeQuestionResponse,
} from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import Link from "next/link";
import { getLocale, getTimeZone, getTranslations } from "next-intl/server";
import { textProps } from "~/features/online-exams/arabic";
import type { LooseTranslator } from "~/lib/i18n/loose";
import {
  againHref,
  continueHref,
  PRACTICE_HREF,
  percentText,
} from "../practice-model";
import type { PracticeAttemptRead } from "../reads";

// Narrow on purpose: the full translator type hits TS2589 (MDRS-176).
type Translate = LooseTranslator;

type Outcome = NonNullable<PracticeQuestionResponse["outcome"]>;

const OUTCOME: Record<Outcome, string> = {
  CORRECT: "correct",
  WRONG: "wrong",
  BLANK: "blank",
};

// The colours of a past exam's screen (`my-exam-result.tsx`).
const OUTCOME_BADGE = {
  CORRECT: "success",
  WRONG: "error",
  BLANK: "secondary",
} as const;

/**
 * A finished çalışma attempt (MDRS-248, Faz 3): the percentage, the correct,
 * wrong and blank counts, and every question with the talebe's choice and
 * the correct options, in the colours of a past exam's screen; "Tekrar çöz"
 * and "Çalışma sorularına dön". An attempt still in progress leads back to it.
 */
export async function PracticeResult({ read }: { read: PracticeAttemptRead }) {
  const t: Translate = (await getTranslations("tedris.Practice")) as never;
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
        <Link className="mds-btn mds-btn--link" href={PRACTICE_HREF}>
          {t("pageTitle")}
        </Link>
      </nav>
      {read.status === "ok" ? (
        <Result
          attempt={read.attempt}
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
          <p className="mbs-3">
            {read.status === "failed" ? (
              <Button variant="outline" size="small" href="">
                {t("retry")}
              </Button>
            ) : (
              <Button variant="secondary" size="small" href={PRACTICE_HREF}>
                {t("backToList")}
              </Button>
            )}
          </p>
        </Alert>
      )}
    </main>
  );
}

function Result({
  attempt,
  t,
  at,
  locale,
}: {
  attempt: PracticeAttemptResponse;
  t: Translate;
  at: (value: Date | string) => string;
  locale: string;
}) {
  const heading = (
    <h1 className="mds-h1" dir="auto">
      {attempt.setId ? attempt.title : t("poolTitle")}
    </h1>
  );
  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button href={againHref(attempt)}>{t("again")}</Button>
      <Button variant="secondary" href={PRACTICE_HREF}>
        {t("backToList")}
      </Button>
    </div>
  );

  if (attempt.status !== "FINISHED" || !attempt.result) {
    return (
      <>
        {heading}
        <Alert tone="neutral" title={t("inProgressTitle")}>
          <p>{t("inProgress")}</p>
          <p className="mbs-3">
            <Button size="small" href={continueHref(attempt)}>
              {t("continue")}
            </Button>
          </p>
        </Alert>
      </>
    );
  }

  const r = attempt.result;
  const counts = [
    { key: "correct", value: r.correct },
    { key: "wrong", value: r.wrong },
    { key: "blank", value: r.blank },
  ] as const;

  return (
    <>
      {heading}
      <section
        className="mds-card flex flex-col gap-3"
        aria-labelledby="practice-result-percent"
        data-testid="practice-result"
      >
        <p className="mds-caption">{t("resultTitle")}</p>
        <h2 id="practice-result-percent" className="mds-h1 mds-num">
          {percentText(r.percent, locale)}
        </h2>
        <dl className="flex flex-wrap gap-6">
          {counts.map(({ key, value }) => (
            <div key={key} className="flex flex-col gap-1">
              <dt className="mds-caption">{t(key)}</dt>
              <dd className="mds-h3 mds-num" data-testid={`practice-${key}`}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
        {attempt.finishedAt ? (
          <p className="mds-body-sm text-neutral-muted">
            {t("finishedAt", { at: at(attempt.finishedAt) })}
          </p>
        ) : null}
        {actions}
      </section>

      <section
        className="flex flex-col gap-3"
        aria-labelledby="practice-answers"
      >
        <h2 id="practice-answers" className="mds-h2">
          {t("answersTitle")}
        </h2>
        <ol className="flex flex-col gap-3">
          {attempt.questions.map((q) => (
            <li key={q.id}>
              <AnsweredQuestion question={q} t={t} />
            </li>
          ))}
        </ol>
      </section>

      {actions}
    </>
  );
}

function AnsweredQuestion({
  question,
  t,
}: {
  question: PracticeQuestionResponse;
  t: Translate;
}) {
  const outcome: Outcome = question.outcome ?? "BLANK";
  return (
    <article
      className="mds-card flex flex-col gap-2"
      data-testid="practice-answer"
      data-outcome={outcome}
    >
      <div className="flex flex-wrap items-center gap-2">
        <strong>{t("questionNumber", { number: question.number })}</strong>
        <Badge variant={OUTCOME_BADGE[outcome]}>{t(OUTCOME[outcome])}</Badge>
      </div>
      <p
        className="mds-body"
        {...textProps(question.text, "var(--fs-body)", 1)}
      >
        {question.text}
      </p>
      <p
        className="mds-caption text-neutral-muted"
        data-testid="practice-answer-set"
      >
        {t("fromSet", { title: question.setTitle })}
      </p>
      <ul className="flex flex-col gap-1">
        {question.options.map((o) => {
          const chosen = question.chosenOptionIds.includes(o.id);
          return (
            <li
              key={o.id}
              className="mds-body-sm flex flex-wrap items-center gap-2"
              data-chosen={chosen ? "true" : undefined}
              data-correct={o.correct ? "true" : undefined}
            >
              <span {...textProps(o.text, "var(--fs-body-sm)", 1)}>
                {o.text}
              </span>
              {chosen ? <Badge variant="info">{t("chosen")}</Badge> : null}
              {o.correct ? (
                <Badge variant="success">{t("correctOption")}</Badge>
              ) : null}
            </li>
          );
        })}
      </ul>
      {outcome === "BLANK" ? (
        <p className="mds-body-sm text-neutral-muted">{t("noAnswer")}</p>
      ) : null}
    </article>
  );
}
