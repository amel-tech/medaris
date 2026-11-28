"use client";

import { Button } from "@medaris/ui/mds/button";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { type QuestionState, TEXT_SCALES } from "../take-model";

/**
 * The parts of a question screen the online exam (MDRS-299) and the çalışma
 * soruları (MDRS-248) share: the options, A− / A+ and the question list.
 * Each takes its words from its caller, so each screen keeps its own catalogue.
 */

// The question itself (its text, its option tiles) is @medaris/ui's
// QuestionSheet, which nazar's preview draws too (MDRS-248, ortak görünüm).
export {
  optionLetter,
  optionsLayout,
  QuestionOptions,
  QuestionSheet,
  ScrollPane,
  SHORT_OPTION,
} from "@medaris/ui/mds/question-sheet";

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

/**
 * The question list's drawer on a desk (MDRS-248, tek ekran): from 1024px
 * the list is not under the question but behind "Sorular" in the top bar,
 * so the question screen fits the window. Below that the list stays at the
 * end of the page and the toggle is not drawn (app/tedris.css).
 */
export interface QuestionList {
  id: string;
  open: boolean;
  setOpen: (open: boolean | ((was: boolean) => boolean)) => void;
  toggleRef: { current: HTMLButtonElement | null };
  /** closes the drawer; `refocus` puts the focus back on the toggle (Esc, Kapat) */
  close: (refocus: boolean) => void;
}

export function useQuestionList(): QuestionList {
  const id = useId();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) toggleRef.current?.focus();
  }, []);
  // One object per open/closed, so the list's effects run when it opens or
  // closes, not on every render of the page (the exam's clock ticks each second).
  return useMemo(
    () => ({ id, open, setOpen, toggleRef, close }),
    [id, open, close]
  );
}

/** "Sorular" in the top bar: opens and closes the list's drawer. */
export function QuestionListToggle({
  list,
  label,
}: {
  list: QuestionList;
  label: string;
}) {
  return (
    <Button
      ref={list.toggleRef}
      size="small"
      variant="outline"
      className="take-list-toggle"
      aria-expanded={list.open}
      aria-controls={list.id}
      data-testid="take-list-toggle"
      onClick={() => list.setOpen((was) => !was)}
    >
      {label}
    </Button>
  );
}

/**
 * The numbered list of the questions, each coloured by its state; a click
 * goes there. With `list`, it is also the drawer "Sorular" opens on a desk:
 * Esc, "Kapat", a click outside it or a question picked in it closes it.
 */
export function QuestionNavigator({
  items,
  index,
  onGo,
  title,
  itemLabel,
  legend,
  list,
  closeLabel,
}: {
  items: ReadonlyArray<{ id: string; state: QuestionState }>;
  index: number;
  onGo: (to: number) => void;
  title: string;
  itemLabel: (number: number, state: QuestionState) => string;
  /** a key to the colours under the list; the exam draws none */
  legend?: ReactNode;
  /** the drawer's state, from `useQuestionList` */
  list?: QuestionList;
  /** the drawer's close button: "Kapat" */
  closeLabel?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const open = list?.open ?? false;
  const close = list?.close;
  // Open: the focus goes to the current question, and Esc or a click
  // anywhere outside the drawer (and its toggle) closes it.
  useEffect(() => {
    if (!open || !close) return;
    const nav = ref.current;
    nav?.querySelector<HTMLElement>("[aria-current=step]")?.focus();
    const onKey = (event: KeyboardEvent) => {
      // An Esc a note's panel or a dialog has taken is not the drawer's.
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      close(true);
    };
    const onDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (!target || nav?.contains(target)) return;
      if (list?.toggleRef.current?.contains(target)) return;
      close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, close, list]);
  return (
    <nav
      ref={ref}
      id={list?.id}
      className="mds-card take-navigator flex flex-col gap-2"
      data-open={open || undefined}
      aria-label={title}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="mds-h3">{title}</h2>
        {list && closeLabel ? (
          <Button
            size="small"
            variant="ghost"
            className="take-navigator__close"
            onClick={() => list.close(true)}
          >
            {closeLabel}
          </Button>
        ) : null}
      </div>
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
              onClick={() => {
                onGo(i);
                // The focus goes back to "Sorular", not to a hidden tile.
                if (open) list?.close(true);
              }}
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
