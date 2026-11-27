"use client";

import type { MyQuestionNoteResponse } from "@medaris/services/tedrisat";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { ChoiceChips } from "@medaris/ui/mds/choice-chips";
import { Icon, type IconName } from "@medaris/ui/mds/icon";
import { useTranslations } from "next-intl";
import {
  type CSSProperties,
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  QuestionNote,
  QuestionNoteSummary,
} from "~/features/question-notes/components/question-note";
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
  /**
   * The talebe's note on it (soru notları): the icon, and the note with the
   * hoca's answer under the options. Absent where notes are off and none
   * was written.
   */
  note?: { enabled: boolean; initial: MyQuestionNoteResponse | null } | null;
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
 * phone, two or three wider), all of one width and, in a row, as tall as the
 * tallest (the owner: "kartlar aynı genişlik yüksekliğe sahip değil"). A tile whose
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
  const visible = useMemo(() => new Set(shown.map((q) => q.id)), [shown]);
  // Stable, so the memoised cards keep their props.
  const leave = useCallback(() => setTargeted(null), []);

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
                aria-controls={visible.has(q.id) ? cardId(q.id) : undefined}
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
        onChange={(v) => {
          setFilter((v as Filter | null) ?? "all");
          setTargeted(null);
        }}
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
          className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-2 xl:grid-cols-3"
          data-testid="answer-grid"
        >
          {shown.map((q) => (
            <li key={q.id} className="flex min-w-0">
              <AnswerCard
                question={q}
                id={cardId(q.id)}
                testId={cardTestId}
                targeted={targeted === q.id}
                onLeave={leave}
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
  onLeave,
}: {
  question: ReviewItem;
  id: string;
  testId: string;
  targeted: boolean;
  /** focus left the card: its ring goes */
  onLeave: () => void;
}) {
  const t = useTranslations("tedris.AnswerReview");
  const look = LOOK[question.outcome];
  // Only what the talebe needs to see: the choice and the correct option.
  const lines = question.options.filter((o) => o.chosen || o.correct);
  // The card keeps its note: the icon's panel writes it, the summary shows it.
  const [note, setNote] = useState(question.note?.initial ?? null);
  // A newer note from the server (a refresh after the hoca answered) wins;
  // keyed on its times, not on the object, which every render makes anew.
  const initial = question.note?.initial ?? null;
  const initialAt = initial ? new Date(initial.updatedAt).getTime() : null;
  const initialReplyAt = initial?.repliedAt
    ? new Date(initial.repliedAt).getTime()
    : null;
  useEffect(() => {
    setNote(initial);
  }, [initialAt, initialReplyAt]);
  return (
    <article
      id={id}
      tabIndex={-1}
      className="mds-card flex h-full w-full flex-col gap-2 break-words"
      data-testid={testId}
      data-outcome={question.outcome}
      data-targeted={targeted ? "true" : undefined}
      onBlur={targeted ? onLeave : undefined}
      style={{
        padding: "var(--space-4)",
        borderInlineStartWidth: "4px",
        borderInlineStartColor: look.edge,
        overflowWrap: "anywhere",
        scrollMarginBlockStart: "6rem",
        ...(targeted ? TARGETED : null),
      }}
    >
      <div className="question-note-anchor flex flex-wrap items-center gap-2">
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
        {question.note ? (
          <span className="ms-auto inline-flex">
            <QuestionNote
              questionId={question.id}
              questionNumber={question.number}
              note={note}
              onChange={setNote}
              enabled={question.note.enabled}
            />
          </span>
        ) : null}
      </div>
      <QuestionText
        text={question.text}
        moreLabel={t("showMore")}
        lessLabel={t("showLess")}
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
          // The option's text on the start side, its badges on the same row
          // at the end, however long the text runs.
          <li
            key={o.id}
            className="mds-body-sm flex items-start justify-between gap-2"
            data-chosen={o.chosen ? "true" : undefined}
            data-correct={o.correct ? "true" : undefined}
          >
            <span className="min-w-0 flex-1">
              <ArabicText
                text={o.text}
                size="var(--fs-body-sm)"
                className="block"
              />
            </span>
            <span
              className="flex shrink-0 flex-wrap justify-end gap-1"
              data-testid="answer-option-badges"
            >
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
            </span>
          </li>
        ))}
      </ul>
      {question.outcome === "blank" ? (
        <p className="mds-caption text-neutral-muted">{t("noAnswer")}</p>
      ) : null}
      {question.note ? <QuestionNoteSummary note={note} /> : null}
    </article>
  );
});

/** The lines a long question's text shows on its card before "Devamını göster". */
export const CLAMP_LINES = 6;

/**
 * Whether a question's text is long enough to be cut on its card: more than
 * a few paragraphs, or more characters than six lines of a narrow card hold.
 * Measured again on the page, where a text that fits shows no button.
 */
export const isLongText = (text: string) =>
  text.split("\n").length > CLAMP_LINES || [...text].length > 280;

/**
 * A question's text on its card (MDRS-248, uzun soru): its own lines and
 * paragraphs kept, and a long one cut at six lines with "Devamını göster",
 * so one long question does not stretch its card, and with it every card in
 * the row, by a screen's height. The button opens it in place and says
 * "Daha az göster" while it is open.
 */
function QuestionText({
  text,
  moreLabel,
  lessLabel,
}: {
  text: string;
  moreLabel: string;
  lessLabel: string;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(() => isLongText(text));
  // On the page the cut is measured: a text that fits its lines has no button.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || open || el.clientHeight === 0) return;
    setLong(el.scrollHeight > el.clientHeight + 1);
  }, [text, open]);
  return (
    <div className="flex flex-col items-start gap-1">
      <div
        ref={ref}
        id={id}
        className="answer-question w-full"
        data-testid="answer-question-text"
        data-clamped={open || !long ? undefined : "true"}
        style={open || !long ? undefined : CLAMPED}
      >
        <ArabicText
          as="p"
          className="mds-body-sm"
          text={text}
          size="var(--fs-body-sm)"
        />
      </div>
      {long ? (
        <Button
          variant="link"
          size="small"
          aria-expanded={open}
          aria-controls={id}
          data-testid="answer-question-more"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? lessLabel : moreLabel}
        </Button>
      ) : null}
    </div>
  );
}

const CLAMPED: CSSProperties = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: CLAMP_LINES,
  overflow: "hidden",
};
