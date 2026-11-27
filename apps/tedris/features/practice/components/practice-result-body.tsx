"use client";

import type {
  PracticeAttemptResponse,
  PracticeQuestionResponse,
} from "@medaris/services/tedrisat";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { ChoiceChips } from "@medaris/ui/mds/choice-chips";
import { Icon, type IconName } from "@medaris/ui/mds/icon";
import { Progress } from "@medaris/ui/mds/progress";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { textProps } from "~/features/online-exams/arabic";
import { againHref, PRACTICE_HREF, percentText } from "../practice-model";

type Outcome = NonNullable<PracticeQuestionResponse["outcome"]>;
type Filter = "all" | Outcome;

/**
 * Each outcome in words, a glyph and a colour (the colours of a past exam's
 * screen, `my-exam-result.tsx`): the colour is never the only cue.
 */
const OUTCOME: Record<
  Outcome,
  {
    key: "correct" | "wrong" | "blank";
    badge: "success" | "error" | "secondary";
    tone: "success" | "error" | "neutral";
    icon: IconName;
  }
> = {
  CORRECT: { key: "correct", badge: "success", tone: "success", icon: "check" },
  WRONG: { key: "wrong", badge: "error", tone: "error", icon: "close" },
  BLANK: { key: "blank", badge: "secondary", tone: "neutral", icon: "ban" },
};
const OUTCOMES = ["CORRECT", "WRONG", "BLANK"] as const;

/**
 * A finished çalışma attempt's result (MDRS-248): the percentage with its
 * bar, the correct, wrong and blank counts as stats with their glyphs,
 * "Tekrar çöz" and "Çalışma sorularına dön" right under them, then every
 * question, which a filter narrows to the correct, wrong or blank ones.
 * "Set: <ad>" is written under a question only in a mixed (pool) attempt,
 * where the questions come from several sets.
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
  const [filter, setFilter] = useState<Filter>("all");
  const r = attempt.result;
  if (!r) return null;

  const percent = percentText(r.percent, locale);
  const outcomeOf = (q: PracticeQuestionResponse): Outcome =>
    q.outcome ?? "BLANK";
  // From the questions themselves, so a chip's count is what it shows.
  const counts: Record<Outcome, number> = { CORRECT: 0, WRONG: 0, BLANK: 0 };
  for (const q of attempt.questions) counts[outcomeOf(q)] += 1;
  const shown =
    filter === "all"
      ? attempt.questions
      : attempt.questions.filter((q) => outcomeOf(q) === filter);
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

      <section
        className="flex flex-col gap-3"
        aria-labelledby="practice-answers"
      >
        <h2 id="practice-answers" className="mds-h2">
          {t("answersTitle")}
        </h2>
        <ChoiceChips
          legend={t("filterLegend")}
          value={filter}
          onChange={(v) => setFilter((v as Filter | null) ?? "all")}
          options={[
            {
              value: "all",
              label: t("filterItem", {
                label: t("filterAll"),
                count: attempt.questions.length,
              }),
            },
            ...OUTCOMES.map((o) => ({
              value: o,
              icon: <Icon name={OUTCOME[o].icon} size="sm" />,
              label: t("filterItem", {
                label: t(OUTCOME[o].key),
                count: counts[o],
              }),
              disabled: counts[o] === 0,
            })),
          ]}
        />
        <p className="mds-visually-hidden" aria-live="polite">
          {filter === "all" ? "" : t("filterShown", { count: shown.length })}
        </p>
        {shown.length === 0 ? (
          <p className="mds-body-sm text-neutral-muted">{t("filterEmpty")}</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {shown.map((q) => (
              <li key={q.id}>
                <AnsweredQuestion question={q} pooled={pooled} />
              </li>
            ))}
          </ol>
        )}
      </section>

      {actions}
    </>
  );
}

function AnsweredQuestion({
  question,
  pooled,
}: {
  question: PracticeQuestionResponse;
  pooled: boolean;
}) {
  const t = useTranslations("tedris.Practice");
  const outcome: Outcome = question.outcome ?? "BLANK";
  const look = OUTCOME[outcome];
  return (
    <article
      className="mds-card flex flex-col gap-2"
      data-testid="practice-answer"
      data-outcome={outcome}
      style={{
        borderInlineStartWidth: "4px",
        borderInlineStartColor:
          outcome === "CORRECT"
            ? "var(--border-success-default)"
            : outcome === "WRONG"
              ? "var(--border-error-default)"
              : "var(--border-neutral-strong)",
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <strong>{t("questionNumber", { number: question.number })}</strong>
        <Badge variant={look.badge} icon={<Icon name={look.icon} size="sm" />}>
          {t(look.key)}
        </Badge>
      </div>
      <p
        className="mds-body"
        {...textProps(question.text, "var(--fs-body)", 1)}
      >
        {question.text}
      </p>
      {pooled ? (
        <p
          className="mds-caption text-neutral-muted"
          data-testid="practice-answer-set"
          dir="auto"
        >
          {t("fromSet", { title: question.setTitle })}
        </p>
      ) : null}
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
              {chosen ? (
                // A wrong choice in the error colour with its cross; a right one in info.
                <Badge
                  variant={o.correct ? "info" : "error"}
                  icon={o.correct ? undefined : <Icon name="close" size="sm" />}
                >
                  {t("chosen")}
                </Badge>
              ) : null}
              {o.correct ? (
                <Badge variant="success" icon={<Icon name="check" size="sm" />}>
                  {t("correctOption")}
                </Badge>
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
