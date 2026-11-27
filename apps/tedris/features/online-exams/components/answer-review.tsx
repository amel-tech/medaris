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
import { optionLetter } from "./question-parts";

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
 * phone, two or three wider), all of one width and one fixed height (the
 * owner: "kartlar eşit boyda ve dolu görünsün"). A card whose content runs
 * past that height is cut, with "Devamını göster": the card then grows over
 * its neighbours, which do not move, until Esc or a click outside it. A tile
 * whose question the filter hides shows all of them again first. 500 questions
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
  // The one card drawn whole over its neighbours, if any.
  const [expanded, setExpanded] = useState<string | null>(null);

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
          setExpanded(null);
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
          className="answer-grid grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
          data-testid="answer-grid"
        >
          {shown.map((q) => (
            <li key={q.id} className="answer-cell" data-testid="answer-cell">
              <AnswerCard
                question={q}
                id={cardId(q.id)}
                testId={cardTestId}
                targeted={targeted === q.id}
                onLeave={leave}
                expanded={expanded === q.id}
                onExpand={setExpanded}
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
  expanded,
  onExpand,
}: {
  question: ReviewItem;
  id: string;
  testId: string;
  targeted: boolean;
  /** focus left the card: its ring goes */
  onLeave: () => void;
  /** drawn over its neighbours, whole */
  expanded: boolean;
  /** opens this card (its id) or closes the open one (null) */
  onExpand: (id: string | null) => void;
}) {
  const t = useTranslations("tedris.AnswerReview");
  const look = LOOK[question.outcome];
  const bodyId = useId();
  const cardRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
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

  // Whether the card's content runs past its fixed height. Guessed from the
  // text first, then measured on the page, where a card whose content fits
  // has no button.
  const [overflows, setOverflows] = useState(() => isHeavy(question));
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || expanded) return;
    const measure = () => {
      if (el.clientHeight === 0) return;
      setOverflows(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, question, note]);

  // Open: Esc puts it back and the focus on its button; a click anywhere
  // outside the card puts it back.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onExpand(null);
      moreRef.current?.focus();
    };
    const onDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (target && cardRef.current?.contains(target)) return;
      onExpand(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [expanded, onExpand]);

  return (
    <article
      ref={cardRef}
      id={id}
      tabIndex={-1}
      className="mds-card answer-card flex flex-col gap-2 break-words"
      data-testid={testId}
      data-outcome={question.outcome}
      data-targeted={targeted ? "true" : undefined}
      data-expanded={expanded ? "true" : undefined}
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
      <div
        ref={bodyRef}
        id={bodyId}
        className="answer-card__body flex flex-col gap-2"
        data-testid="answer-card-body"
        data-clipped={!expanded && overflows ? "true" : undefined}
      >
        <div className="answer-question" data-testid="answer-question-text">
          <ArabicText
            as="p"
            className="mds-body-sm"
            text={question.text}
            size="var(--fs-body-sm)"
          />
        </div>
        {question.setTitle ? (
          <p
            className="mds-caption text-neutral-muted"
            data-testid={`${testId}-set`}
          >
            {t("fromSetLabel")} <ArabicText text={question.setTitle} />
          </p>
        ) : null}
        {/* Every option with its letter: the talebe's choice is the filled
            letter, the correct one has a ✓ (the owner: "Senin seçimin"
            yerine seçilen şıkkın harfi). */}
        <ul className="flex flex-col gap-1" aria-label={t("optionsLabel")}>
          {question.options.map((o, i) => (
            <li
              key={o.id}
              className="answer-option mds-body-sm"
              data-chosen={o.chosen ? "true" : undefined}
              data-correct={o.correct ? "true" : undefined}
            >
              <span
                className="answer-option__letter"
                aria-hidden="true"
                data-testid="answer-option-letter"
              >
                {optionLetter(i)}
              </span>
              <span className="min-w-0 flex-1">
                <ArabicText
                  text={o.text}
                  size="var(--fs-body-sm)"
                  className="block"
                />
              </span>
              {o.correct ? (
                <span className="answer-option__mark">
                  <Icon name="check" size="sm" />
                </span>
              ) : null}
              {o.chosen ? (
                <span className="mds-visually-hidden">
                  ({t("chosenHidden")})
                </span>
              ) : null}
              {o.correct ? (
                <span className="mds-visually-hidden">
                  ({t("correctHidden")})
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        {question.outcome === "blank" ? (
          <p className="mds-caption text-neutral-muted">{t("noAnswer")}</p>
        ) : null}
        {question.note ? <QuestionNoteSummary note={note} /> : null}
      </div>
      {overflows || expanded ? (
        <Button
          ref={moreRef}
          variant="link"
          size="small"
          className="answer-card__more"
          aria-expanded={expanded}
          aria-controls={bodyId}
          data-testid="answer-card-more"
          onClick={() => onExpand(expanded ? null : question.id)}
        >
          {expanded ? t("collapse") : t("expand")}
        </Button>
      ) : null}
    </article>
  );
});

/**
 * Whether a question's text is long: more than a few paragraphs, or more
 * characters than a few lines of a narrow card hold.
 */
export const isLongText = (text: string) =>
  text.split("\n").length > 6 || [...text].length > 280;

/**
 * Whether a card's content is likely to run past the card's fixed height
 * (MDRS-248, tek ekran): a long question, a long option, or many options.
 * The first guess only; the page measures it.
 */
export const isHeavy = (question: Pick<ReviewItem, "text" | "options">) =>
  isLongText(question.text) ||
  question.options.length > 5 ||
  question.options.reduce((n, o) => n + [...o.text].length, 0) > 200;
