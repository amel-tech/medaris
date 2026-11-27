"use client";

import { Badge } from "@medaris/ui/mds/badge";
import { ChoiceChips } from "@medaris/ui/mds/choice-chips";
import { Icon, type IconName } from "@medaris/ui/mds/icon";
import { useTranslations } from "next-intl";
import {
  type CSSProperties,
  memo,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { ArabicText } from "./arabic-text";

export type ReviewOutcome = "correct" | "wrong" | "blank";
type Filter = "all" | ReviewOutcome;

/** One answered question, as a çalışma attempt and a past exam both give it. */
export interface ReviewItem {
  id: string;
  number: number;
  text: string;
  outcome: ReviewOutcome;
  options: ReadonlyArray<{
    id: string;
    text: string;
    chosen: boolean;
    correct: boolean;
  }>;
  /** the set the question came from, written only in a mixed attempt */
  setTitle?: string | null;
  /** a line of the caller's beside the badge (an exam's points) */
  meta?: ReactNode;
}

/**
 * Each outcome in words, a glyph, a colour and, on the strip, a border style:
 * the colour is never the only cue.
 */
const LOOK: Record<
  ReviewOutcome,
  {
    badge: "success" | "error" | "secondary";
    icon: IconName;
    edge: string;
    tile: CSSProperties;
  }
> = {
  correct: {
    badge: "success",
    icon: "check",
    edge: "var(--border-success-default)",
    tile: {
      background: "var(--background-success-subtle)",
      borderColor: "var(--border-success-default)",
      borderStyle: "solid",
      color: "var(--text-success-default)",
    },
  },
  wrong: {
    badge: "error",
    icon: "close",
    edge: "var(--border-error-default)",
    tile: {
      background: "var(--background-error-subtle)",
      borderColor: "var(--border-error-default)",
      borderStyle: "solid",
      color: "var(--text-error-default)",
    },
  },
  blank: {
    badge: "secondary",
    icon: "ban",
    edge: "var(--border-neutral-strong)",
    tile: {
      background: "var(--background-neutral-sunken)",
      borderColor: "var(--border-neutral-strong)",
      borderStyle: "dashed",
      color: "var(--text-neutral-muted)",
    },
  },
};
const OUTCOMES = ["correct", "wrong", "blank"] as const;

const TARGETED: CSSProperties = {
  boxShadow:
    "0 0 0 2px var(--background-neutral-page), 0 0 0 4px var(--border-brand-default)",
};

/**
 * The answers of a finished çalışma attempt or a past exam (MDRS-248): a
 * strip of numbered tiles, one per question in its outcome's colour, glyph
 * and border, that scrolls to the question and focuses it; the filter by
 * outcome; and the questions as narrow cards in a grid (one column on a
 * phone, two or three wider), each as tall as its own text. A tile whose
 * question the filter hides shows all of them again first. 500 questions
 * are 500 tiles and 500 cards, drawn whole: no virtual list and no
 * `content-visibility` (its estimated heights moved a scrolled-to card out
 * of view; measured, see docs/migration/mdrs-248-talebe-sonuc.md).
 */
export function AnswerReview({
  items,
  heading,
  headingId,
  cardTestId,
}: {
  items: readonly ReviewItem[];
  heading: string;
  headingId: string;
  cardTestId: string;
}) {
  const t = useTranslations("tedris.AnswerReview");
  const prefix = useId();
  const cardId = (id: string) => `${prefix}-answer-${id}`;
  const [filter, setFilter] = useState<Filter>("all");
  const [target, setTarget] = useState<string | null>(null);
  const [targeted, setTargeted] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<ReviewOutcome, number> = { correct: 0, wrong: 0, blank: 0 };
    for (const q of items) c[q.outcome] += 1;
    return c;
  }, [items]);
  const shown = useMemo(
    () =>
      filter === "all" ? items : items.filter((q) => q.outcome === filter),
    [items, filter]
  );

  // After the render that shows the card: scroll to it and focus it.
  useEffect(() => {
    if (!target) return;
    const el = document.getElementById(cardId(target));
    setTarget(null);
    if (!el) return;
    // Glides over a short way; a long one (question 450 of 500) jumps, and
    // so does every one when the talebe asked for less motion.
    const still =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const far =
      Math.abs(el.getBoundingClientRect().top) > window.innerHeight * 2;
    el.scrollIntoView?.({
      behavior: still || far ? "auto" : "smooth",
      block: "start",
    });
    el.focus({ preventScroll: true });
  });

  const goTo = (q: ReviewItem) => {
    if (filter !== "all" && q.outcome !== filter) setFilter("all");
    setTargeted(q.id);
    setTarget(q.id);
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby={headingId}>
      <h2 id={headingId} className="mds-h2">
        {heading}
      </h2>
      <nav aria-label={t("stripLabel")} data-testid="answer-strip">
        <ol className="flex flex-wrap gap-1">
          {items.map((q) => (
            <li key={q.id}>
              <button
                type="button"
                className="mds-num inline-flex items-center justify-center gap-0.5 rounded-sm border px-1 mds-caption"
                style={{
                  ...LOOK[q.outcome].tile,
                  minInlineSize: "2.5rem",
                  blockSize: "2rem",
                  fontWeight: 600,
                }}
                data-outcome={q.outcome}
                aria-label={t("tileLabel", {
                  number: q.number,
                  outcome: t(q.outcome),
                })}
                aria-controls={cardId(q.id)}
                onClick={() => goTo(q)}
              >
                {q.number}
                <Icon name={LOOK[q.outcome].icon} size="sm" />
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <ChoiceChips
        legend={t("filterLegend")}
        value={filter}
        onChange={(v) => setFilter((v as Filter | null) ?? "all")}
        options={[
          {
            value: "all",
            label: t("filterItem", {
              label: t("filterAll"),
              count: items.length,
            }),
          },
          ...OUTCOMES.map((o) => ({
            value: o,
            icon: <Icon name={LOOK[o].icon} size="sm" />,
            label: t("filterItem", { label: t(o), count: counts[o] }),
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
        <ol
          className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-3"
          data-testid="answer-grid"
        >
          {shown.map((q) => (
            <li key={q.id} className="min-w-0">
              <AnswerCard
                question={q}
                id={cardId(q.id)}
                testId={cardTestId}
                targeted={targeted === q.id}
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// Memoised: a tile's click re-draws the strip, not 500 unchanged cards.
const AnswerCard = memo(function AnswerCard({
  question,
  id,
  testId,
  targeted,
}: {
  question: ReviewItem;
  id: string;
  testId: string;
  targeted: boolean;
}) {
  const t = useTranslations("tedris.AnswerReview");
  const look = LOOK[question.outcome];
  // Only what the talebe needs to see: the choice and the correct option.
  const lines = question.options.filter((o) => o.chosen || o.correct);
  return (
    <article
      id={id}
      tabIndex={-1}
      className="mds-card flex flex-col gap-2 break-words"
      data-testid={testId}
      data-outcome={question.outcome}
      data-targeted={targeted ? "true" : undefined}
      style={{
        padding: "var(--space-4)",
        borderInlineStartWidth: "4px",
        borderInlineStartColor: look.edge,
        overflowWrap: "anywhere",
        scrollMarginBlockStart: "6rem",
        ...(targeted ? TARGETED : null),
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <strong className="mds-body-sm">
          {t("questionNumber", { number: question.number })}
        </strong>
        <Badge variant={look.badge} icon={<Icon name={look.icon} size="sm" />}>
          {t(question.outcome)}
        </Badge>
        {question.meta ? (
          <span className="mds-caption text-neutral-muted">
            {question.meta}
          </span>
        ) : null}
      </div>
      <ArabicText
        as="p"
        className="mds-body-sm"
        text={question.text}
        size="var(--fs-body-sm)"
      />
      {question.setTitle ? (
        <p
          className="mds-caption text-neutral-muted"
          data-testid={`${testId}-set`}
        >
          {t("fromSetLabel")} <ArabicText text={question.setTitle} />
        </p>
      ) : null}
      <ul className="flex flex-col gap-1">
        {lines.map((o) => (
          <li
            key={o.id}
            className="mds-body-sm flex flex-wrap items-center gap-x-2 gap-y-1"
            data-chosen={o.chosen ? "true" : undefined}
            data-correct={o.correct ? "true" : undefined}
          >
            <ArabicText text={o.text} size="var(--fs-body-sm)" />
            {o.chosen ? (
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
        ))}
      </ul>
      {question.outcome === "blank" ? (
        <p className="mds-caption text-neutral-muted">{t("noAnswer")}</p>
      ) : null}
    </article>
  );
});
