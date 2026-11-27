"use client";

import { Badge } from "@medaris/ui/mds/badge";
import { Icon } from "@medaris/ui/mds/icon";
import { QuestionSheet } from "@medaris/ui/mds/question-sheet";
import { Tooltip } from "@medaris/ui/mds/tooltip";
import { useTranslations } from "next-intl";
import { type ReactNode, useCallback, useId, useState } from "react";
import { paragraphDir } from "../arabic";

/**
 * The hoca's questions page, as the editor and a published set or exam show
 * it (MDRS-248, ortak görünüm; the owner: "sorular sağdaki sütunda sadece
 * akordiyon mantığında soruları tek satırlık cümleyle göstererek görünmeli …
 * sol tarafta da hazırladığı sorular olmalı. Sorular da öğrencinin ekranda
 * gördüğü gibi görünmeli ki hoca öğrenciyi daha iyi anlayabilsin"). On a
 * desk, two columns: on the start side every question as the talebe sees it
 * (tedris's own QuestionSheet, `HocaSheet`), on the end side every question
 * as one line (`QuestionLines`), a click bringing it into view. Under
 * 1024px one column: the questions, without the lines.
 */

/** What a question lacks, worded; a çalışma seti's question needs no topic (MDRS-248). */
export function useLacking(
  question: { lacks: readonly string[] },
  practice: boolean
): string[] {
  const t = useTranslations("nazar");
  return lackingWords(t, question.lacks, practice);
}

/** `useLacking` outside a component's own hooks: for every line of the list at once. */
export const lackingWords = (
  t: (
    key: `OnlineExams.${"lackText" | "lackOption" | "lackCorrect" | "lackTopic"}`
  ) => string,
  lacks: readonly string[],
  practice: boolean
): string[] =>
  lacks
    .filter((lack) => !(practice && lack === "topic"))
    .map((lack) =>
      lack === "text"
        ? t("OnlineExams.lackText")
        : lack === "option"
          ? t("OnlineExams.lackOption")
          : lack === "correct"
            ? t("OnlineExams.lackCorrect")
            : t("OnlineExams.lackTopic")
    );

/**
 * The exclamation mark of a question that is not ready (MDRS-248): a button
 * whose tooltip, on hover and focus, says what it lacks line by line, named
 * "Eksik: …"; a click opens the question's form.
 */
export function LacksMark({
  lacking,
  onEdit,
}: {
  lacking: string[];
  onEdit: () => void;
}) {
  const t = useTranslations("nazar");
  return (
    <Tooltip
      label={
        <span className="flex flex-col">
          {lacking.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </span>
      }
    >
      <button
        type="button"
        data-lacks=""
        aria-label={t("OnlineExams.lacksLabel", {
          lacks: lacking.join(", "),
        })}
        onClick={onEdit}
        className="mds-btn mds-icon-btn mds-btn--small mds-btn--ghost inline-flex shrink-0 align-middle text-error-default"
      >
        <Icon name="warning" size="sm" />
      </button>
    </Tooltip>
  );
}

/** A question's text on one line: its lines joined, for the list's ellipsis. */
export const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Which question was last picked in the list, and the id each question's
 * place on the page carries (`placeId`), so its line can name and reach it.
 */
export function usePickedQuestion() {
  const listId = useId();
  const [picked, setPicked] = useState<string | null>(null);
  const placeId = useCallback((key: string) => `${listId}-${key}`, [listId]);
  /** Marks the question and brings its sheet to the top of the window, focused. */
  const pick = useCallback(
    (key: string, scroll = true) => {
      setPicked(key);
      if (!scroll) return;
      window.setTimeout(() => {
        const place = document.getElementById(placeId(key));
        place?.scrollIntoView?.({ block: "start", behavior: "smooth" });
        place
          ?.querySelector<HTMLElement>("article")
          ?.focus({ preventScroll: true });
      }, 0);
    },
    [placeId]
  );
  return { picked, pick, setPicked, placeId };
}

export interface QuestionLine {
  key: string;
  number: number;
  text: string;
  /** what it lacks, worded; none on a published set */
  lacking?: string[];
  pending?: boolean;
  failed?: boolean;
}

/**
 * A question as one line of the list on the end side (MDRS-248, ortak
 * görünüm): "3. soru · its text…", cut with an ellipsis where the line ends.
 * A click brings the question into view on the start side and marks it, its
 * line too (`aria-current`). A question that is not ready is tinted red and
 * ends with its exclamation mark.
 */
function QuestionRow({
  line,
  picked,
  controls,
  onOpen,
  onEdit,
}: {
  line: QuestionLine;
  picked: boolean;
  /** the id of the question's place on the start side */
  controls: string;
  onOpen: () => void;
  onEdit?: () => void;
}) {
  const t = useTranslations("nazar");
  const lacking = line.lacking ?? [];
  const lacks = lacking.length > 0;
  const text = oneLine(line.text);
  return (
    <div
      className={`flex min-w-0 items-center gap-1 rounded-control border pe-1 ${
        lacks
          ? "border-error-default bg-error-subtle"
          : picked
            ? "border-brand-default bg-brand-subtle"
            : "border-neutral-subtle bg-neutral-surface"
      }`}
      data-question-row=""
      data-picked={picked || undefined}
      data-lacks-row={lacks ? "" : undefined}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent py-2 ps-3 text-start text-neutral-default"
        aria-current={picked || undefined}
        aria-controls={controls}
        onClick={onOpen}
      >
        <Icon
          name="chevronRight"
          size="sm"
          className="shrink-0 text-neutral-muted"
        />
        <span className="mds-body-sm shrink-0 font-semibold">
          {t("OnlineExams.questionNumber", { number: line.number })}
        </span>
        <span
          className={`mds-body-sm min-w-0 flex-1 truncate ${text ? "" : "text-neutral-muted"}`}
          dir={paragraphDir(text)}
        >
          {text || t("OnlineExams.noText")}
        </span>
      </button>
      {line.pending ? (
        <span className="mds-caption shrink-0 text-neutral-muted">
          {t("OnlineExams.saving")}
        </span>
      ) : null}
      {line.failed ? (
        <Badge variant="error">{t("OnlineExams.notSaved")}</Badge>
      ) : null}
      {lacks && onEdit ? <LacksMark lacking={lacking} onEdit={onEdit} /> : null}
    </div>
  );
}

/**
 * The two columns: `children` on the start side (each question's place
 * carrying `placeId(key)`), the lines on the end side, on a desk only and
 * held in view while the questions scroll.
 */
export function QuestionsBoard({
  lines,
  picked,
  placeId,
  onPick,
  onEdit,
  action,
  children,
}: {
  lines: readonly QuestionLine[];
  picked: string | null;
  placeId: (key: string) => string;
  onPick: (key: string) => void;
  /** the exclamation mark's click: the question's form */
  onEdit?: (key: string) => void;
  /** under the lines: "Soru ekle", in reach however long the list is */
  action?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("nazar");
  return (
    <div className="grid gap-4 min-[64rem]:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] min-[64rem]:items-start">
      <div className="flex min-w-0 flex-col gap-3">{children}</div>
      {lines.length > 0 ? (
        <nav
          className="hidden min-w-0 flex-col gap-2 min-[64rem]:sticky min-[64rem]:top-4 min-[64rem]:flex min-[64rem]:max-h-[calc(100dvh-2rem)] min-[64rem]:overflow-y-auto"
          aria-label={t("OnlineExams.questionRows")}
        >
          <ol className="flex list-none flex-col gap-1 ps-0">
            {lines.map((line) => (
              <li key={line.key}>
                <QuestionRow
                  line={line}
                  picked={line.key === picked}
                  controls={placeId(line.key)}
                  onOpen={() => onPick(line.key)}
                  onEdit={onEdit ? () => onEdit(line.key) : undefined}
                />
              </li>
            ))}
          </ol>
          {action ? <div>{action}</div> : null}
        </nav>
      ) : null}
    </div>
  );
}

/**
 * A question as the talebe will see it: tedris's QuestionSheet from
 * @medaris/ui, the same number line, text and option tiles, read only.
 * Laid over it for the hoca only: a ✓ named "Doğru" on the correct options,
 * and `head` (his tools) after "3. soru", where the talebe has the note icon.
 */
export function HocaSheet({
  question,
  number,
  head,
  tools,
  className,
}: {
  question: {
    key?: string;
    id: string;
    text: string;
    answerMode: string;
    options: ReadonlyArray<{ id: string; text: string; correct: boolean }>;
  };
  number: number;
  /** after the number: topics, the exclamation mark, saving… */
  head?: ReactNode;
  /** at the line's end: the notes icon, edit, delete */
  tools?: ReactNode;
  className?: string;
}) {
  const t = useTranslations("nazar");
  const textId = useId();
  return (
    <QuestionSheet
      textId={textId}
      textAs="h3"
      text={question.text}
      emptyText={t("OnlineExams.noText")}
      question={question}
      chosen={[]}
      onChoose={() => {}}
      readOnly
      correct={{
        ids: question.options.filter((o) => o.correct).map((o) => o.id),
        label: t("OnlineExams.correct"),
      }}
      legend={t("OnlineExams.optionsLabel")}
      multiHint={t("OnlineExams.multiHint")}
      questionPaneLabel={t("OnlineExams.questionPane")}
      optionsPaneLabel={t("OnlineExams.optionsLabel")}
      watch={question.key ?? question.id}
      className={className}
      head={
        <>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {/* The talebe's line: "3. soru" (tedris's questionNumber). */}
            <p className="mds-caption text-neutral-muted">
              {t("OnlineExams.questionNumber", { number })}
            </p>
            {head}
          </div>
          {tools ? (
            <div className="flex shrink-0 items-center gap-1">{tools}</div>
          ) : null}
        </>
      }
    />
  );
}
