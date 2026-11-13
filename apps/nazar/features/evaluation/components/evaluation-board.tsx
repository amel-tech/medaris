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
import { releaseExamResults, saveEvaluation, saveExamResult } from "../actions";
import {
  type EvaluationBoard as Board,
  EVALUATION_NOTE_MAX,
  type EvaluationColumn,
  type EvaluationTalebe,
  type ExamResult,
  enteredCount,
  evaluationExportHref,
  fullCount,
  MARK_STATUSES,
  type Mark,
  type MarkStatus,
  markKey,
  nextRow,
  noteBody,
  parseScore,
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

type SaveOutcome = "saved" | "failed" | "signedOut";

/**
 * Cells saved at once and drawn before the answer comes (MDRS-248). The saves
 * of one cell go out one after another, so tedrisat keeps the last press. A
 * save that fails, or throws, puts the cell back to what tedrisat last kept,
 * unless a later press on the same cell has been made since: that press is
 * what the cell shows, and its own answer settles it.
 */
function useCellSaves<V>(initial: ReadonlyMap<string, V>) {
  const [cells, setCells] = useState<ReadonlyMap<string, V>>(initial);
  // What tedrisat last kept, per cell touched on this page.
  const kept = useRef(new Map<string, V | undefined>());
  const queue = useRef(new Map<string, Promise<SaveOutcome>>());
  const latest = useRef(new Map<string, number>());

  const save = (
    key: string,
    value: V,
    send: () => Promise<SaveOutcome>
  ): Promise<SaveOutcome> => {
    if (!kept.current.has(key)) kept.current.set(key, initial.get(key));
    const turn = (latest.current.get(key) ?? 0) + 1;
    latest.current.set(key, turn);
    setCells((now) => new Map(now).set(key, value));
    const run = (queue.current.get(key) ?? Promise.resolve("saved")).then(
      async (): Promise<SaveOutcome> => {
        let outcome: SaveOutcome;
        try {
          outcome = await send();
        } catch {
          outcome = "failed";
        }
        if (outcome === "saved") kept.current.set(key, value);
        else if (outcome === "failed" && latest.current.get(key) === turn) {
          const back = kept.current.get(key);
          setCells((now) => {
            const next = new Map(now);
            if (back === undefined) next.delete(key);
            else next.set(key, back);
            return next;
          });
        }
        return outcome;
      }
    );
    queue.current.set(key, run);
    return run;
  };

  return { cells, save };
}

/**
 * The body of "Değerlendirme" (MDRS-248). Closed, it is the whole course at a
 * glance: a row per talebe, a column per homework recited to the müderris,
 * each cell its mark or "Bekliyor". A column's heading opens it: one screen
 * with every talebe, each row three buttons, Tam · Eksik · Vermedi, and an
 * optional short note; a press is saved at once and the count above,
 * "18/30 tam", follows. ↑ and ↓ move between rows, 1, 2 and 3 mark the row in
 * focus. A save that fails, or never reaches tedrisat, puts the cell back
 * and says so.
 */
export function EvaluationBoard({
  initial,
  courseId,
}: {
  initial: Board;
  courseId: string;
}) {
  const t = useTranslations("nazar.Evaluation");
  const { notify } = useToaster();
  const markSaves = useCellSaves(initial.marks);
  const marks = markSaves.cells;
  const resultSaves = useCellSaves(initial.results);
  const results = resultSaves.cells;
  // Exams opened to the talebe on this page, by lesson id (MDRS-248).
  const [released, setReleased] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        initial.columns.filter((c) => c.exam?.releasedAt).map((c) => c.lessonId)
      )
  );
  const [open, setOpen] = useState<string | null>(null);
  const board = { ...initial, marks, results };

  const failed = (talebe: EvaluationTalebe) =>
    notify({
      tone: "error",
      title: t("saveFailed"),
      description: talebe.name ?? t("unnamed"),
    });

  const saveResult = async (
    column: EvaluationColumn,
    talebe: EvaluationTalebe,
    entry: ExamResult
  ): Promise<boolean> => {
    const key = markKey(column.lessonId, talebe.id);
    const before = results.get(key);
    if (before?.score === entry.score && before?.absent === entry.absent) {
      return true;
    }
    const outcome = await resultSaves.save(key, entry, async () => {
      const result = await saveExamResult(
        column.lessonId,
        talebe.id,
        entry.absent ? { absent: true } : { score: entry.score ?? 0 }
      );
      if (handleUnauthenticated(result)) return "signedOut";
      return "success" in result && result.success ? "saved" : "failed";
    });
    if (outcome === "failed") failed(talebe);
    return outcome === "saved";
  };

  const release = async (column: EvaluationColumn) => {
    const result = await releaseExamResults(column.lessonId);
    if (handleUnauthenticated(result)) return;
    if (!("success" in result) || !result.success) {
      notify({ tone: "error", title: t("releaseFailed") });
      return;
    }
    setReleased((now) => new Set(now).add(column.lessonId));
    notify({ title: t("releasedToast") });
  };

  const save = (
    column: EvaluationColumn,
    talebe: EvaluationTalebe,
    status: MarkStatus,
    note: string | null
  ) => {
    const key = markKey(column.lessonId, talebe.id);
    const before = marks.get(key);
    if (before?.status === status && before.note === note) return;
    void markSaves
      .save(key, { status, note }, async () => {
        const result = await saveEvaluation(
          column.lessonId,
          talebe.id,
          status,
          note
        );
        if (handleUnauthenticated(result)) return "signedOut";
        return "success" in result && result.success ? "saved" : "failed";
      })
      .then((outcome) => {
        if (outcome === "failed") failed(talebe);
      });
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
  if (column?.exam) {
    return (
      <ExamScreen
        column={column}
        max={column.exam.maxScore}
        board={board}
        released={released.has(column.lessonId)}
        onBack={() => setOpen(null)}
        onSave={(talebe, entry) => saveResult(column, talebe, entry)}
        onRelease={() => release(column)}
      />
    );
  }
  if (column) {
    return (
      <ColumnScreen
        column={column}
        board={board}
        onBack={() => setOpen(null)}
        onMark={(talebe, status, note) => save(column, talebe, status, note)}
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
          <span className="flex flex-wrap items-center gap-1">
            <Button
              variant="link"
              size="small"
              onClick={() => setOpen(c.lessonId)}
              data-testid={`evaluation-open-${c.lessonId}`}
            >
              {c.exam
                ? t("examColumnTitle", {
                    week: c.weekNumber,
                    title: c.title,
                    max: c.exam.maxScore,
                  })
                : t("columnTitle", { week: c.weekNumber, title: c.title })}
            </Button>
            {c.exam ? (
              <Badge variant="secondary">
                {t(c.exam.isRetake ? "retakeBadge" : "examBadge")}
              </Badge>
            ) : null}
          </span>
        ),
        render: (row) => {
          if (c.exam) {
            const result = results.get(markKey(c.lessonId, row.id));
            return !result ? (
              <span className="mds-caption">{t("pending")}</span>
            ) : result.absent ? (
              <Badge variant="error">{t("absentExam")}</Badge>
            ) : (
              <span className="mds-num">
                {result.score}/{c.exam.maxScore}
              </span>
            );
          }
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="mds-caption">{t("openHint")}</p>
        <Button
          variant="outline"
          size="small"
          href={evaluationExportHref(courseId)}
          iconLeft={<Icon name="download" size="sm" />}
          data-testid="evaluation-download"
        >
          {t("download")}
        </Button>
      </div>
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

/**
 * An exam column opened (MDRS-248): every talebe with a score box and
 * "Girmedi". Enter saves the row and moves to the box below; leaving a box
 * saves it too. A score above "tam puan" is refused here, as tedrisat refuses
 * it. "Sonuçları talebelere aç" opens the results to the talebe once.
 */
function ExamScreen({
  column,
  max,
  board,
  released,
  onBack,
  onSave,
  onRelease,
}: {
  column: EvaluationColumn;
  max: number;
  board: Board;
  released: boolean;
  onBack: () => void;
  onSave: (talebe: EvaluationTalebe, entry: ExamResult) => Promise<boolean>;
  onRelease: () => Promise<void>;
}) {
  const t = useTranslations("nazar.Evaluation");
  const boxes = useRef<Array<HTMLLIElement | null>>([]);
  const [releasing, setReleasing] = useState(false);
  const { entered, total } = enteredCount(board, column.lessonId);

  return (
    <section
      className="flex flex-col gap-4"
      aria-labelledby={`evaluation-column-${column.lessonId}`}
      data-testid="exam-column"
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
            {t("examColumnTitle", {
              week: column.weekNumber,
              title: column.title,
              max,
            })}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <output
            className="mds-h3"
            aria-live="polite"
            data-testid="exam-count"
          >
            {t("entered", { entered, total })}
          </output>
          {released ? (
            <Badge variant="success" data-testid="exam-released">
              {t("released")}
            </Badge>
          ) : (
            <Button
              loading={releasing}
              onClick={async () => {
                setReleasing(true);
                await onRelease();
                setReleasing(false);
              }}
              data-testid="exam-release"
            >
              {t("release")}
            </Button>
          )}
        </div>
      </div>
      <p className="mds-caption">{t("examKeysHint")}</p>
      <ul className="m-0 flex list-none flex-col p-0">
        {board.talebe.map((talebe, index) => (
          <ScoreRow
            key={talebe.id}
            ref={(el) => {
              boxes.current[index] = el;
            }}
            talebe={talebe}
            max={max}
            result={board.results.get(markKey(column.lessonId, talebe.id))}
            onSave={(entry) => onSave(talebe, entry)}
            onNext={() =>
              boxes.current[index + 1]?.querySelector("input")?.focus()
            }
          />
        ))}
      </ul>
    </section>
  );
}

function ScoreRow({
  ref,
  talebe,
  max,
  result,
  onSave,
  onNext,
}: {
  ref: (el: HTMLLIElement | null) => void;
  talebe: EvaluationTalebe;
  max: number;
  result: ExamResult | undefined;
  onSave: (entry: ExamResult) => Promise<boolean>;
  onNext: () => void;
}) {
  const t = useTranslations("nazar.Evaluation");
  const [draft, setDraft] = useState(
    result && !result.absent && result.score !== null
      ? String(result.score)
      : ""
  );
  const [problem, setProblem] = useState<string | null>(null);
  // The score last sent: Enter saves and moves on, and the blur that follows
  // must not send the same value again.
  const saved = useRef(draft);
  const name = talebe.name ?? t("unnamed");
  const absent = result?.absent === true;

  const commit = async (): Promise<void> => {
    const parsed = parseScore(draft, max);
    if (parsed.kind === "empty") {
      setProblem(null);
      return;
    }
    if (parsed.kind !== "score") {
      setProblem(
        parsed.kind === "over" ? t("scoreTooHigh", { max }) : t("scoreInvalid")
      );
      return;
    }
    setProblem(null);
    if (draft === saved.current) return;
    const before = saved.current;
    const sent = draft;
    saved.current = sent;
    // A later score typed since keeps its own place.
    if (
      !(await onSave({ score: parsed.score, absent: false })) &&
      saved.current === sent
    ) {
      saved.current = before;
    }
  };

  return (
    <li
      ref={ref}
      className="flex flex-wrap items-center gap-3 py-3 border-be border-neutral-subtle last:border-be-0"
      data-testid={`exam-row-${talebe.id}`}
    >
      <bdi className="mds-label min-inline-0 flex-1">{name}</bdi>
      <div className="flex flex-col gap-1">
        <Input
          size="small"
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          aria-label={t("scoreLabel", { name })}
          aria-invalid={problem ? true : undefined}
          value={draft}
          trailing={`/${max}`}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            void commit();
            const kind = parseScore(draft, max).kind;
            if (kind === "score" || kind === "empty") onNext();
          }}
        />
        {problem ? (
          <p className="mds-error" role="alert">
            {problem}
          </p>
        ) : null}
      </div>
      <Button
        size="small"
        variant={absent ? "primary" : "outline"}
        aria-pressed={absent}
        onClick={() => {
          setDraft("");
          setProblem(null);
          saved.current = "";
          void onSave({ score: null, absent: true });
        }}
      >
        {t("absentExam")}
      </Button>
    </li>
  );
}
