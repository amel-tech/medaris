"use client";

import type {
  PracticeAttemptResponse,
  PracticeQuestionResponse,
} from "@medaris/services/tedrisat";
import { Button } from "@medaris/ui/mds/button";
import { Icon, type IconName } from "@medaris/ui/mds/icon";
import { Progress } from "@medaris/ui/mds/progress";
import { useLocale, useTranslations } from "next-intl";
import {
  AnswerReview,
  type ReviewItem,
} from "~/features/online-exams/components/answer-review";
import { showsNote } from "~/features/question-notes/note-model";
import { againHref, PRACTICE_HREF, percentText } from "../practice-model";

type Outcome = NonNullable<PracticeQuestionResponse["outcome"]>;

/**
 * Each outcome in words, a glyph and a colour (the colours of a past exam's
 * screen, `my-exam-result.tsx`): the colour is never the only cue.
 */
const OUTCOME: Record<
  Outcome,
  {
    key: "correct" | "wrong" | "blank";
    tone: "success" | "error" | "neutral";
    icon: IconName;
  }
> = {
  CORRECT: { key: "correct", tone: "success", icon: "check" },
  WRONG: { key: "wrong", tone: "error", icon: "close" },
  BLANK: { key: "blank", tone: "neutral", icon: "ban" },
};
const OUTCOMES = ["CORRECT", "WRONG", "BLANK"] as const;

/**
 * A finished çalışma attempt's result (MDRS-248): the percentage with its
 * bar, the correct, wrong and blank counts as stats with their glyphs,
 * "Tekrar çöz" and "Çalışma sorularına dön" right under them, then the
 * answers (`AnswerReview`, shared with a past exam): a numbered tile per
 * question, the filter and the questions as narrow cards. "Set: <ad>" is
 * written under a question only in a mixed (pool) attempt, where the
 * questions come from several sets.
 */
export function PracticeResultBody({
  attempt,
  finishedAtText,
}: {
  attempt: PracticeAttemptResponse;
  finishedAtText: string | null;
}) {
  const t = useTranslations("tedris.Practice");
  const locale = useLocale();
  const r = attempt.result;
  if (!r) return null;

  const percent = percentText(r.percent, locale);
  const outcomeOf = (q: PracticeQuestionResponse): Outcome =>
    q.outcome ?? "BLANK";
  // From the questions themselves, so a chip's count is what it shows.
  const counts: Record<Outcome, number> = { CORRECT: 0, WRONG: 0, BLANK: 0 };
  for (const q of attempt.questions) counts[outcomeOf(q)] += 1;
  const pooled = !attempt.setId;

  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button href={againHref(attempt)}>{t("again")}</Button>
      <Button variant="secondary" href={PRACTICE_HREF}>
        {t("backToList")}
      </Button>
    </div>
  );

  return (
    <>
      <section
        className="mds-card flex flex-col gap-4"
        aria-labelledby="practice-result-percent"
        data-testid="practice-result"
      >
        <div className="flex flex-col gap-2">
          <p className="mds-caption">{t("resultTitle")}</p>
          <h2 id="practice-result-percent" className="mds-h1 mds-num">
            {percent}
          </h2>
          <Progress
            value={Math.round(Number(r.percent))}
            label={t("resultTitle")}
            labelHidden
            completeLabel={t("progressComplete")}
          />
        </div>
        {/* The system's Stat, drawn with its class layer so each term and
            its count stay a <dt>/<dd> pair: a glyph and a colour per count. */}
        <dl className="grid grid-cols-3 gap-3">
          {OUTCOMES.map((o) => (
            <div
              key={o}
              className={`mds-card mds-stat${OUTCOME[o].tone === "neutral" ? "" : ` mds-stat--${OUTCOME[o].tone}`}`}
            >
              <dt className="mds-caption">{t(OUTCOME[o].key)}</dt>
              <dd className="mds-stat__value">
                <span className="mds-stat__cue">
                  <Icon name={OUTCOME[o].icon} size="sm" />
                </span>
                <span data-testid={`practice-${OUTCOME[o].key}`}>
                  {counts[o]}
                </span>
              </dd>
            </div>
          ))}
        </dl>
        {finishedAtText ? (
          <p className="mds-body-sm text-neutral-muted">
            {t("finishedAt", { at: finishedAtText })}
          </p>
        ) : null}
        {actions}
      </section>

      <AnswerReview
        items={attempt.questions.map((q) => reviewItemOf(q, pooled))}
        heading={t("answersTitle")}
        headingId="practice-answers"
        cardTestId="practice-answer"
      />

      {actions}
    </>
  );
}

const REVIEW_OUTCOME: Record<Outcome, ReviewItem["outcome"]> = {
  CORRECT: "correct",
  WRONG: "wrong",
  BLANK: "blank",
};

/** A çalışma question as the shared answer cards take it. */
export const reviewItemOf = (
  q: PracticeQuestionResponse,
  pooled: boolean
): ReviewItem => ({
  id: q.id,
  number: q.number,
  text: q.text,
  outcome: REVIEW_OUTCOME[q.outcome ?? "BLANK"],
  options: q.options.map((o) => ({
    id: o.id,
    text: o.text,
    chosen: q.chosenOptionIds.includes(o.id),
    correct: o.correct,
  })),
  setTitle: pooled ? q.setTitle : null,
  note: showsNote(q)
    ? { enabled: q.talebeNotes === true, initial: q.myNote ?? null }
    : null,
});
