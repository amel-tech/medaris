"use client";

import { Button } from "@medaris/ui/mds/button";
import { Checkbox } from "@medaris/ui/mds/checkbox";
import { RadioGroup } from "@medaris/ui/mds/radio-group";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from "react";
import { type QuestionState, TEXT_SCALES } from "../take-model";
import { ArabicText } from "./arabic-text";

/**
 * The parts of a question screen the online exam (MDRS-299) and the çalışma
 * soruları (MDRS-248) share: the options, A− / A+ and the question list.
 * Each takes its words from its caller, so each screen keeps its own catalogue.
 */

/** The letter an option is shown and picked by: A, B, C … */
export const optionLetter = (i: number) => String.fromCharCode(65 + i);

const optionText = (text: string) => (
  // A block, so an Arabic option takes the whole row and lines up on the right.
  <ArabicText text={text} size="var(--fs-body)" className="block" />
);

/** The letter badge in front of an option; the option's text names it. */
const letterBadge = (i: number) => (
  <span className="take-option__letter">{optionLetter(i)}</span>
);

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

/**
 * A question's options as tiles (MDRS-248, the owner: "şıkları kare halinde
 * mi yapsak aynı hizada kalabilmeleri için; butona tıklandığında işaretlenmiş
 * olur"): each a button-like tile with its letter, all of one width and one
 * height, chosen by a click anywhere on it; chosen, it fills and shows a ✓.
 * Underneath they are still radio buttons, or check boxes when more than one
 * may be right, hidden from sight only, so the arrow keys, the focus and a
 * screen reader work as they do on any choice.
 */
export function QuestionOptions({
  question,
  chosen,
  onChoose,
  legend,
  multiHint,
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
}) {
  const hintId = useId();
  const className = `take-options take-options--${optionsLayout(question.options)}`;
  if (question.answerMode === "MULTIPLE") {
    return (
      <fieldset
        className={`mds-choice-group ${className}`}
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
            label={optionText(o.text)}
            checked={chosen.includes(o.id)}
            onCheckedChange={(on) =>
              onChoose(
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
      onChange={(value) => onChoose([value])}
      options={question.options.map((o, i) => ({
        value: o.id,
        label: optionText(o.text),
        icon: letterBadge(i),
      }))}
    />
  );
}

/**
 * The option a key picks: 1–9, or a letter A–Z, counted from the first
 * option; `null` for any other key. A keyboard that does not write Latin
 * letters or digits (an Arabic one) is read by the key's place.
 */
export const optionKeyIndex = (event: {
  key: string;
  code?: string;
}): number | null => {
  if (/^[1-9]$/.test(event.key)) return Number(event.key) - 1;
  if (/^[a-z]$/i.test(event.key))
    return event.key.toUpperCase().charCodeAt(0) - 65;
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code ?? "");
  if (digit) return Number(digit[1]) - 1;
  const letter = /^Key([A-Z])$/.exec(event.code ?? "");
  if (letter && !/^[\x20-\x7e]$/.test(event.key))
    return letter[1].charCodeAt(0) - 65;
  return null;
};

/** What a key that picks option `i` makes of the choice: a radio takes it, a check box turns over. */
export const pickedBy = (
  question: {
    answerMode: string;
    options: ReadonlyArray<{ id: string }>;
  },
  chosen: readonly string[],
  i: number
): string[] | null => {
  const option = question.options[i];
  if (!option) return null;
  if (question.answerMode !== "MULTIPLE") return [option.id];
  return chosen.includes(option.id)
    ? chosen.filter((id) => id !== option.id)
    : [...chosen, option.id];
};

/** Where a key belongs to what has the focus, not to the question screen. */
const OWN_KEYS =
  "input:not([type=radio], [type=checkbox]), textarea, select, [contenteditable]:not([contenteditable=false]), [role=dialog], [role=alertdialog], [role=textbox], [role=combobox]";
const ACTIVATES = "button, a[href], [role=button], [role=link], summary";
const CHOICE = "[role=radio], [role=checkbox]";

/**
 * The question screen's keys (MDRS-248): 1–9 or A–Z picks an option, Enter
 * goes on, as "Sonraki" or, at the end, "Bitir" does. Not while a field, a
 * dialog or another control that takes the key has the focus, and not with
 * Ctrl, Alt or Cmd. Enter on a focused option card goes on too; on a
 * button it stays the button's. Draws nothing.
 */
export function TakeKeys({
  question,
  chosen,
  onChoose,
  onEnter,
  off = false,
}: {
  question:
    | {
        answerMode: string;
        options: ReadonlyArray<{ id: string }>;
      }
    | undefined;
  chosen: readonly string[];
  onChoose: (optionIds: string[]) => void;
  onEnter: () => void;
  /** a dialog is open, or the attempt is ending */
  off?: boolean;
}) {
  const latest = useRef({ question, chosen, onChoose, onEnter, off });
  latest.current = { question, chosen, onChoose, onEnter, off };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { question, chosen, onChoose, onEnter, off } = latest.current;
      if (off || !question || event.defaultPrevented || event.isComposing)
        return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(OWN_KEYS)) return;
      const onChoice = Boolean(target?.closest(CHOICE));
      if (event.key === "Enter") {
        if (!onChoice && target?.closest(ACTIVATES)) return;
        event.preventDefault();
        onEnter();
        return;
      }
      const i = optionKeyIndex(event);
      if (i === null) return;
      const next = pickedBy(question, chosen, i);
      if (!next) return;
      event.preventDefault();
      onChoose(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}

/**
 * A− / A+ over `TEXT_SCALES`, once per screen, in its top bar (MDRS-248):
 * the step is the page's, not a question's.
 */
export function TextSizeButtons({
  step,
  onStep,
  smallerLabel,
  biggerLabel,
  groupLabel,
}: {
  step: number;
  onStep: (by: -1 | 1) => void;
  smallerLabel: string;
  biggerLabel: string;
  /** the pair's name, "Yazı boyutu" */
  groupLabel: string;
}) {
  return (
    <fieldset
      className="m-0 flex min-w-0 gap-1 border-0 p-0"
      aria-label={groupLabel}
      data-testid="text-size"
    >
      <Button
        size="small"
        variant="outline"
        aria-label={smallerLabel}
        disabled={step === 0}
        onClick={() => onStep(-1)}
      >
        A−
      </Button>
      <Button
        size="small"
        variant="outline"
        aria-label={biggerLabel}
        disabled={step === TEXT_SCALES.length - 1}
        onClick={() => onStep(1)}
      >
        A+
      </Button>
    </fieldset>
  );
}

/**
 * The question list's colours (the owner, 22 Nov 2026: "cevaplanmamışsa sarı
 * olsun, atlanmışsa turuncu olsun, cevaplanmışsa beyaz/dark olsun"), set
 * inline so no stylesheet order can undo them. Unanswered is the warning
 * pair; skipped is the warning's bold fill, the closest the system has to
 * orange (it has no orange token); answered is the sheet itself, white by
 * day and dark by night. The current question carries a brand ring on top.
 * Each button's name says its state too, so colour is never the only cue.
 */
export const INDICATOR: Record<QuestionState, CSSProperties> = {
  // Not answered yet: plain.
  unseen: {
    background: "var(--background-neutral-surface)",
    borderColor: "var(--border-neutral-strong)",
    color: "var(--text-neutral-default)",
  },
  // Skipped: dark yellow.
  skipped: {
    background: "var(--background-warning-bold)",
    borderColor: "var(--border-warning-default)",
    color: "var(--text-neutral-on-bold)",
  },
  // Answered: blue.
  answered: {
    background: "var(--background-info-bold)",
    borderColor: "var(--border-info-default)",
    color: "var(--text-neutral-on-bold)",
  },
};

const CURRENT: CSSProperties = {
  boxShadow:
    "0 0 0 2px var(--background-neutral-page), 0 0 0 4px var(--border-brand-default)",
};

/** The numbered list of the questions, each coloured by its state; a click goes there. */
export function QuestionNavigator({
  items,
  index,
  onGo,
  title,
  itemLabel,
  legend,
}: {
  items: ReadonlyArray<{ id: string; state: QuestionState }>;
  index: number;
  onGo: (to: number) => void;
  title: string;
  itemLabel: (number: number, state: QuestionState) => string;
  /** a key to the colours under the list; the exam draws none */
  legend?: ReactNode;
}) {
  return (
    <nav className="mds-card flex flex-col gap-2" aria-label={title}>
      <h2 className="mds-h3">{title}</h2>
      <ol className="flex flex-wrap gap-2">
        {items.map(({ id, state }, i) => (
          <li key={id}>
            <Button
              size="small"
              variant="outline"
              data-state={state}
              style={{
                ...INDICATOR[state],
                ...(i === index ? CURRENT : null),
              }}
              aria-current={i === index ? "step" : undefined}
              aria-label={itemLabel(i + 1, state)}
              onClick={() => onGo(i)}
            >
              {i + 1}
            </Button>
          </li>
        ))}
      </ol>
      {legend}
    </nav>
  );
}
