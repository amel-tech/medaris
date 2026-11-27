"use client";

import {
  type ElementType,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ArabicText } from "./arabic-text";
import { Checkbox } from "./checkbox";
import { cx } from "./cx";
import { RadioGroup } from "./radio-group";

/**
 * A question as the talebe sees it (MDRS-248, ortak görünüm): its number
 * line, its text, its options as tiles, and whatever the screen puts under
 * them. The talebe's question screen in tedris and the hoca's preview in
 * nazar draw this one component, so the hoca sees the question exactly as
 * it will be answered (the owner: "soruları oluşturan kişi talebenin
 * ekranda gördüğü gibi görmesi gerekiyordu"). Its look is in
 * styles/mds/question.css; how the page around it is laid out is the app's.
 */

/** The letter an option is shown and picked by: A, B, C … */
export const optionLetter = (i: number) => String.fromCharCode(65 + i);

/** The longest option text, counted in characters, that still sits in a 2×2 grid (MDRS-248). */
export const SHORT_OPTION = 32;

/**
 * How a question's option tiles are laid out: `grid`, two equal columns on a
 * wide screen, when every option is short; otherwise `list`, one column. The
 * count is in characters (code points), so Arabic is measured as it reads.
 */
export const optionsLayout = (
  options: ReadonlyArray<{ text: string }>
): "grid" | "list" =>
  options.every((o) => [...o.text.trim()].length <= SHORT_OPTION)
    ? "grid"
    : "list";

/** What the hoca's preview lays over the talebe's tiles: the correct ones, named. */
export interface CorrectMark {
  ids: readonly string[];
  /** the mark's name for a screen reader: "Doğru" */
  label: string;
}

const optionText = (
  text: string,
  correct: CorrectMark | undefined,
  id: string
) => (
  <>
    {/* A block, so an Arabic option takes the whole row and lines up on the right. */}
    <ArabicText text={text} size="var(--fs-body)" className="block" />
    {correct?.ids.includes(id) ? (
      <span className="take-option__correct" data-correct-mark="">
        <span aria-hidden="true">✓</span>
        <span className="mds-visually-hidden"> {correct.label}</span>
      </span>
    ) : null}
  </>
);

/** The letter badge in front of an option; the option's text names it. */
const letterBadge = (i: number) => (
  <span className="take-option__letter">{optionLetter(i)}</span>
);

/**
 * A question's options as tiles (MDRS-248, the owner: "şıkları kare halinde
 * mi yapsak aynı hizada kalabilmeleri için; butona tıklandığında işaretlenmiş
 * olur"): each a button-like tile with its letter, all of one width and one
 * height, chosen by a click anywhere on it; chosen, it fills and shows a ✓.
 * Underneath they are still radio buttons, or check boxes when more than one
 * may be right, hidden from sight only, so the arrow keys, the focus and a
 * screen reader work as they do on any choice. `readOnly` (the hoca's
 * preview) draws them the same and takes no choice; `correct` adds the
 * hoca's ✓ on the correct ones.
 */
export function QuestionOptions({
  question,
  chosen,
  onChoose,
  legend,
  multiHint,
  correct,
  readOnly = false,
}: {
  question: {
    answerMode: string;
    options: ReadonlyArray<{ id: string; text: string }>;
  };
  chosen: readonly string[];
  onChoose: (optionIds: string[]) => void;
  legend: string;
  /** shown over check boxes: "Birden fazla doğru olabilir." */
  multiHint: string;
  correct?: CorrectMark;
  readOnly?: boolean;
}) {
  const hintId = useId();
  const className = cx(
    "take-options",
    `take-options--${optionsLayout(question.options)}`
  );
  const choose = readOnly ? () => {} : onChoose;
  if (question.answerMode === "MULTIPLE") {
    return (
      <fieldset
        className={cx("mds-choice-group", className)}
        aria-describedby={hintId}
      >
        <legend className="mds-label">{legend}</legend>
        <p className="mds-help take-options__hint" id={hintId}>
          {multiHint}
        </p>
        {question.options.map((o, i) => (
          <Checkbox
            key={o.id}
            bordered
            icon={letterBadge(i)}
            label={optionText(o.text, correct, o.id)}
            checked={chosen.includes(o.id)}
            onCheckedChange={(on) =>
              choose(
                on ? [...chosen, o.id] : chosen.filter((id) => id !== o.id)
              )
            }
          />
        ))}
      </fieldset>
    );
  }
  return (
    <RadioGroup
      legend={legend}
      bordered
      className={className}
      value={chosen[0] ?? null}
      onChange={(value) => choose([value])}
      options={question.options.map((o, i) => ({
        value: o.id,
        label: optionText(o.text, correct, o.id),
        icon: letterBadge(i),
      }))}
    />
  );
}

/**
 * A pane of the question screen that scrolls on its own when the question
 * is laid out side by side (the question's text, the options), so a long one
 * never pushes the buttons out of the window. A named region; once its
 * content runs past it, it also takes the focus, so the arrow keys can
 * scroll it.
 */
export function ScrollPane({
  className,
  label,
  watch,
  children,
}: {
  className: string;
  /** the pane's name: "Soru metni", "Şıklar" */
  label: string;
  /** what the pane shows (the question's id): measured again when it changes */
  watch: unknown;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [scrolls, setScrolls] = useState(false);
  // `watch` is what the pane shows: measured again, and back at its top, for each question.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = 0;
    const measure = () => setScrolls(el.scrollHeight > el.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);
    return () => observer.disconnect();
  }, [watch]);
  return (
    <section
      ref={ref}
      className={className}
      tabIndex={scrolls ? 0 : undefined}
      aria-label={label}
      data-scrolls={scrolls || undefined}
    >
      {children}
    </section>
  );
}

/** A desk, where the question screen is the window's height (tedris.css). */
export const DESK_QUERY = "(min-width: 64rem)";

/**
 * Lays the sheet out on a desk (MDRS-248, the owner: "ekrana sığıyorsa soru
 * yukarıda, şık aşağıda olmalı"): the question above its options, as
 * everywhere; only when that does not fit the sheet's height does it turn
 * to `split`, the question on one side scrolling on its own and the options
 * on the other. Measured, not guessed: the sheet is put in `stack`, and its
 * content's height is read against its own. Again when the question, the
 * window, the A− / A+ step or a face that loads late changes a size. Written
 * on the element as `data-layout`, outside React, so a measure never draws
 * the page again.
 */
function useFitLayout(
  ref: { current: HTMLElement | null },
  on: boolean,
  watch: unknown
) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!on || !el) return;
    const desk =
      typeof window.matchMedia === "function"
        ? window.matchMedia(DESK_QUERY)
        : null;
    const fit = () => {
      el.dataset.layout = "stack";
      if (!desk?.matches) return;
      if (el.scrollHeight > el.clientHeight + 1) el.dataset.layout = "split";
    };
    fit();
    desk?.addEventListener("change", fit);
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    observer?.observe(el);
    for (const part of el.querySelectorAll(".take-question, .take-options"))
      observer?.observe(part);
    return () => {
      observer?.disconnect();
      desk?.removeEventListener("change", fit);
    };
  }, [on, watch, ref]);
}

/**
 * One question, as the talebe's question screen draws it: the number line
 * (`head`: "3. soru" and the note icon on the talebe's side; the hoca's
 * tools on his), the text, the options, then `children` (the talebe's
 * buttons). With `fit` the sheet measures itself to choose between the
 * question above its options and side by side (`useFitLayout`).
 */
export function QuestionSheet({
  head,
  text,
  textId,
  textAs = "h2",
  emptyText,
  question,
  chosen,
  onChoose,
  legend,
  multiHint,
  questionPaneLabel,
  optionsPaneLabel,
  watch,
  fit = false,
  correct,
  readOnly = false,
  className,
  testId,
  children,
}: {
  head: ReactNode;
  text: string;
  /** the text's id; the sheet is labelled by it */
  textId: string;
  textAs?: ElementType;
  /** what stands for a text not written yet (the hoca's draft) */
  emptyText?: string;
  question: {
    answerMode: string;
    options: ReadonlyArray<{ id: string; text: string }>;
  };
  chosen: readonly string[];
  onChoose: (optionIds: string[]) => void;
  legend: string;
  multiHint: string;
  /** "Soru metni" */
  questionPaneLabel: string;
  /** "Şıklar" */
  optionsPaneLabel: string;
  /** what the sheet shows (the question's id): measured again when it changes */
  watch: unknown;
  fit?: boolean;
  correct?: CorrectMark;
  readOnly?: boolean;
  className?: string;
  testId?: string;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useFitLayout(ref, fit, watch);
  const Text = textAs;
  return (
    <section
      ref={ref}
      className={cx("mds-card take-body flex flex-col gap-3", className)}
      aria-labelledby={textId}
      data-testid={testId}
      data-readonly={readOnly || undefined}
    >
      <div className="question-note-anchor flex min-h-8 items-center justify-between gap-2">
        {head}
      </div>
      <ScrollPane
        className="take-question-pane"
        label={questionPaneLabel}
        watch={watch}
      >
        {text || !emptyText ? (
          <ArabicText
            as={textAs}
            id={textId}
            className="mds-body take-question"
            size="var(--fs-body)"
            text={text}
          />
        ) : (
          <Text
            id={textId}
            className="mds-body take-question take-question--empty"
          >
            {emptyText}
          </Text>
        )}
      </ScrollPane>
      {question.options.length > 0 ? (
        <ScrollPane
          className="take-options-pane"
          label={optionsPaneLabel}
          watch={watch}
        >
          <QuestionOptions
            question={question}
            chosen={chosen}
            onChoose={onChoose}
            legend={legend}
            multiHint={multiHint}
            correct={correct}
            readOnly={readOnly}
          />
        </ScrollPane>
      ) : null}
      {children}
    </section>
  );
}
