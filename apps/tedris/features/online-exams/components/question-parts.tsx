"use client";

import { Button } from "@medaris/ui/mds/button";
import { Checkbox } from "@medaris/ui/mds/checkbox";
import { RadioGroup } from "@medaris/ui/mds/radio-group";
import type { CSSProperties, ReactNode } from "react";
import { type QuestionState, TEXT_SCALES } from "../take-model";
import { ArabicText } from "./arabic-text";

/**
 * The parts of a question screen the online exam (MDRS-299) and the çalışma
 * soruları (MDRS-248) share: the options, A− / A+ and the question list.
 * Each takes its words from its caller, so each screen keeps its own catalogue.
 */

const optionText = (text: string) => (
  <ArabicText text={text} size="var(--fs-body)" />
);

/** A question's options: radio buttons, or check boxes when more than one may be right. */
export function QuestionOptions({
  question,
  chosen,
  onChoose,
  legend,
}: {
  question: {
    answerMode: string;
    options: ReadonlyArray<{ id: string; text: string }>;
  };
  chosen: readonly string[];
  onChoose: (optionIds: string[]) => void;
  legend: string;
}) {
  if (question.answerMode === "MULTIPLE") {
    return (
      <fieldset className="mds-choice-group">
        <legend className="mds-label">{legend}</legend>
        {question.options.map((o) => (
          <Checkbox
            key={o.id}
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
      value={chosen[0] ?? null}
      onChange={(value) => onChoose([value])}
      options={question.options.map((o) => ({
        value: o.id,
        label: optionText(o.text),
      }))}
    />
  );
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
