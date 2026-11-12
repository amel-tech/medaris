"use client";

import { Badge, type BadgeVariant } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { useToaster } from "@medaris/ui/mds/toast";
import { useTranslations } from "next-intl";
import { type KeyboardEvent, useRef, useState } from "react";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import { saveEvaluation } from "../actions";
import {
  type EvaluationBoard as Board,
  EVALUATION_NOTE_MAX,
  type EvaluationColumn,
  type EvaluationTalebe,
  fullCount,
  MARK_STATUSES,
  type Mark,
  type MarkStatus,
  markKey,
  nextRow,
  noteBody,
  statusOfKey,
} from "../evaluation";

const LABEL: Record<MarkStatus, "full" | "incomplete" | "absent"> = {
  FULL: "full",
  INCOMPLETE: "incomplete",
  ABSENT: "absent",
};

const TONE: Record<MarkStatus, BadgeVariant> = {
  FULL: "success",
  INCOMPLETE: "warning",
  ABSENT: "error",
};

/**
 * The body of "Değerlendirme" (MDRS-248). Closed, it is the whole course at a
 * glance: a row per talebe, a column per homework recited to the müderris,
 * each cell its mark or "Bekliyor". A column's heading opens it: one screen
 * with every talebe, each row three buttons, Tam · Eksik · Vermedi, and an
 * optional short note; a press is saved at once and the count above,
 * "18/30 tam", follows. ↑ and ↓ move between rows, 1, 2 and 3 mark the row in
 * focus. A save that fails puts the cell back and says so.
 */
export function EvaluationBoard({ initial }: { initial: Board }) {
  const t = useTranslations("nazar.Evaluation");
  const { notify } = useToaster();
  const [marks, setMarks] = useState<ReadonlyMap<string, Mark>>(initial.marks);
  const [open, setOpen] = useState<string | null>(null);
  const board = { ...initial, marks };

  const save = async (
    column: EvaluationColumn,
    talebe: EvaluationTalebe,
    status: MarkStatus,
    note: string | null
  ) => {
    const key = markKey(column.lessonId, talebe.id);
    const before = marks.get(key);
    if (before?.status === status && before.note === note) return;
    setMarks((now) => new Map(now).set(key, { status, note }));
    const result = await saveEvaluation(
      column.lessonId,
      talebe.id,
      status,
      note
    );
    if (handleUnauthenticated(result)) return;
    if (!("success" in result) || !result.success) {
      setMarks((now) => {
        const back = new Map(now);
        if (before) back.set(key, before);
        else back.delete(key);
        return back;
      });
      notify({
        tone: "error",
        title: t("saveFailed"),
        description: talebe.name ?? t("unnamed"),
      });
    }
  };

  if (initial.columns.length === 0) {
    return (
      <EmptyState icon={<Icon name="book" />}>{t("noColumns")}</EmptyState>
    );
  }
  if (initial.talebe.length === 0) {
    return (
      <EmptyState icon={<Icon name="users" />}>{t("noTalebe")}</EmptyState>
    );
  }

  const column = initial.columns.find((c) => c.lessonId === open);
  if (column) {
    return (
      <ColumnScreen
        column={column}
        board={board}
        onBack={() => setOpen(null)}
        onMark={(talebe, status, note) =>
          void save(column, talebe, status, note)
        }
      />
    );
  }

  const columns: TableColumn<EvaluationTalebe>[] = [
    {
      key: "talebe",
      header: t("talebe"),
      render: (row) => <bdi>{row.name ?? t("unnamed")}</bdi>,
    },
    ...initial.columns.map(
      (c): TableColumn<EvaluationTalebe> => ({
        key: c.lessonId,
        header: (
          <Button
            variant="link"
            size="small"
            onClick={() => setOpen(c.lessonId)}
            data-testid={`evaluation-open-${c.lessonId}`}
          >
            {t("columnTitle", { week: c.weekNumber, title: c.title })}
          </Button>
        ),
        render: (row) => {
          const mark = marks.get(markKey(c.lessonId, row.id));
          return mark ? (
            <Badge variant={TONE[mark.status]}>{t(LABEL[mark.status])}</Badge>
          ) : (
            <span className="mds-caption">{t("pending")}</span>
          );
        },
      })
    ),
  ];

  return (
    <div className="flex flex-col gap-3">
      <p className="mds-caption">{t("openHint")}</p>
      <Table
        caption={t("caption")}
        columns={columns}
        rows={initial.talebe}
        rowKey={(row) => row.id}
      />
    </div>
  );
}

/** One column opened: every talebe on one screen, marked with a press or a key. */
function ColumnScreen({
  column,
  board,
  onBack,
  onMark,
}: {
  column: EvaluationColumn;
  board: Board;
  onBack: () => void;
  onMark: (
    talebe: EvaluationTalebe,
    status: MarkStatus,
    note: string | null
  ) => void;
}) {
  const t = useTranslations("nazar.Evaluation");
  const [active, setActive] = useState(0);
  const rows = useRef<Array<HTMLLIElement | null>>([]);
  const { full, total } = fullCount(board, column.lessonId);

  const focusRow = (index: number) => {
    setActive(index);
    rows.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    // Typing a note keeps its keys.
    if ((event.target as HTMLElement).tagName === "INPUT") return;
    const moved = nextRow(active, event.key, board.talebe.length);
    if (moved !== null) {
      event.preventDefault();
      focusRow(moved);
      return;
    }
    const status = statusOfKey(event.key);
    const talebe = board.talebe[active];
    if (status && talebe) {
      event.preventDefault();
      const mark = board.marks.get(markKey(column.lessonId, talebe.id));
      onMark(talebe, status, mark?.note ?? null);
    }
  };

  return (
    <section
      className="flex flex-col gap-4"
      aria-labelledby={`evaluation-column-${column.lessonId}`}
      data-testid="evaluation-column"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Button
            variant="ghost"
            size="small"
            iconLeft={<Icon name="arrowLeft" size="sm" />}
            onClick={onBack}
          >
            {t("back")}
          </Button>
          <h2
            className="mds-h3"
            id={`evaluation-column-${column.lessonId}`}
            dir="auto"
          >
            {t("columnTitle", { week: column.weekNumber, title: column.title })}
          </h2>
        </div>
        <output
          className="mds-h3"
          aria-live="polite"
          data-testid="evaluation-count"
        >
          {t("count", { full, total })}
        </output>
      </div>
      <p className="mds-caption">{t("keysHint")}</p>
      <ul
        className="m-0 flex list-none flex-col p-0"
        aria-label={t("listLabel")}
        onKeyDown={onKeyDown}
      >
        {board.talebe.map((talebe, index) => (
          <MarkRow
            key={talebe.id}
            ref={(el) => {
              rows.current[index] = el;
            }}
            talebe={talebe}
            mark={board.marks.get(markKey(column.lessonId, talebe.id))}
            active={index === active}
            onFocus={() => setActive(index)}
            onMark={(status, note) => onMark(talebe, status, note)}
          />
        ))}
      </ul>
    </section>
  );
}

function MarkRow({
  ref,
  talebe,
  mark,
  active,
  onFocus,
  onMark,
}: {
  ref: (el: HTMLLIElement | null) => void;
  talebe: EvaluationTalebe;
  mark: Mark | undefined;
  active: boolean;
  onFocus: () => void;
  onMark: (status: MarkStatus, note: string | null) => void;
}) {
  const t = useTranslations("nazar.Evaluation");
  const [draft, setDraft] = useState(mark?.note ?? "");
  const name = talebe.name ?? t("unnamed");

  return (
    <li
      ref={ref}
      // One stop for Tab; the arrows move within the list.
      tabIndex={active ? 0 : -1}
      onFocus={onFocus}
      className="flex flex-wrap items-center gap-3 py-3 border-be border-neutral-subtle last:border-be-0 focus-visible:outline-2"
      aria-label={name}
      data-testid={`evaluation-row-${talebe.id}`}
    >
      <bdi className="mds-label min-inline-0 flex-1">{name}</bdi>
      <fieldset className="flex gap-2 border-0 p-0">
        <legend className="mds-visually-hidden">
          {t("markLegend", { name })}
        </legend>
        {MARK_STATUSES.map((status, i) => (
          <Button
            key={status}
            size="small"
            variant={mark?.status === status ? "primary" : "outline"}
            aria-pressed={mark?.status === status}
            aria-keyshortcuts={String(i + 1)}
            onClick={() => onMark(status, mark?.note ?? null)}
          >
            {t(LABEL[status])}
          </Button>
        ))}
      </fieldset>
      <Input
        size="small"
        aria-label={t("noteLabel", { name })}
        placeholder={t("notePlaceholder")}
        maxLength={EVALUATION_NOTE_MAX}
        dir="auto"
        value={draft}
        // A note goes with a mark: there is nothing to keep it on before.
        disabled={!mark}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (mark && noteBody(draft) !== mark.note) {
            onMark(mark.status, noteBody(draft));
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </li>
  );
}
