import type { EvaluationBoardResponse } from "@medaris/services/tedrisat";

/**
 * "Değerlendirme" of a course as rules (MDRS-248): its talebe as rows, the
 * things they are marked on as columns (today the homework recited to the
 * müderris; exams join as a kind of their own), and the marks. Pure on
 * purpose, so the page has nothing to decide.
 */

export const evaluationHref = (courseId: string): string =>
  `/ders/${encodeURIComponent(courseId)}/degerlendirme`;

/** The longest note on a mark, in characters: tedrisat's limit. */
export const EVALUATION_NOTE_MAX = 280;

/** A mark as given; a cell with none is "Bekliyor". */
export type MarkStatus = "FULL" | "INCOMPLETE" | "ABSENT";

/** The three marks in the order of their buttons and of the keys 1, 2, 3. */
export const MARK_STATUSES: readonly MarkStatus[] = [
  "FULL",
  "INCOMPLETE",
  "ABSENT",
];

/** The kinds of column this page can draw; one it does not know is skipped. */
export type ColumnKind = "MEMORIZE" | "EXAM";

/** What an exam column carries besides its celse (MDRS-248). */
export interface ExamInfo {
  maxScore: number;
  isRetake: boolean;
  /** ISO time the results were opened to the talebe; null while closed. */
  releasedAt: string | null;
}

export interface EvaluationColumn {
  kind: ColumnKind;
  lessonId: string;
  title: string;
  weekNumber: number;
  description: string | null;
  /** Set on an EXAM column only. */
  exam: ExamInfo | null;
}

/** A talebe's exam result: a score, or "Girmedi" with none. */
export interface ExamResult {
  score: number | null;
  absent: boolean;
}

export interface EvaluationTalebe {
  id: string;
  /** null for an account tedrisat has not seen sign in */
  name: string | null;
}

export interface Mark {
  status: MarkStatus;
  note: string | null;
}

export interface EvaluationBoard {
  columns: EvaluationColumn[];
  talebe: EvaluationTalebe[];
  /** by `markKey(lessonId, userId)` */
  marks: ReadonlyMap<string, Mark>;
  /** Exam results, by `markKey(lessonId, userId)` */
  results: ReadonlyMap<string, ExamResult>;
}

export const markKey = (lessonId: string, userId: string): string =>
  `${lessonId}:${userId}`;

const isStatus = (value: unknown): value is MarkStatus =>
  value === "FULL" || value === "INCOMPLETE" || value === "ABSENT";

/** tedrisat's board as the page draws it: columns of a kind it knows only. */
export function boardOf(response: EvaluationBoardResponse): EvaluationBoard {
  const columns = response.columns.flatMap((column): EvaluationColumn[] => {
    const kind = String(column.kind);
    if (kind === "MEMORIZE") {
      return [
        {
          kind: "MEMORIZE",
          lessonId: column.lessonId,
          title: column.title,
          weekNumber: column.weekNumber,
          description: column.description ?? null,
          exam: null,
        },
      ];
    }
    if (kind === "EXAM" && column.exam) {
      return [
        {
          kind: "EXAM",
          lessonId: column.lessonId,
          title: column.title,
          weekNumber: column.weekNumber,
          description: null,
          exam: {
            maxScore: column.exam.maxScore,
            isRetake: column.exam.isRetake,
            releasedAt: column.exam.resultsReleasedAt
              ? new Date(column.exam.resultsReleasedAt).toISOString()
              : null,
          },
        },
      ];
    }
    return [];
  });
  const marks = new Map<string, Mark>();
  for (const mark of response.marks) {
    if (!isStatus(mark.status)) continue;
    marks.set(markKey(mark.lessonId, mark.userId), {
      status: mark.status,
      note: mark.note ?? null,
    });
  }
  const results = new Map<string, ExamResult>();
  for (const result of response.results ?? []) {
    results.set(markKey(result.lessonId, result.userId), {
      score: result.score ?? null,
      absent: result.absent,
    });
  }
  return {
    columns,
    talebe: response.talebe.map((t) => ({ id: t.id, name: t.name ?? null })),
    marks,
    results,
  };
}

/** "18/30 tam": how many of the column's talebe are marked FULL, of all of them. */
export function fullCount(
  board: Pick<EvaluationBoard, "talebe" | "marks">,
  lessonId: string
): { full: number; total: number } {
  const full = board.talebe.filter(
    (t) => board.marks.get(markKey(lessonId, t.id))?.status === "FULL"
  ).length;
  return { full, total: board.talebe.length };
}

/** The status the key 1, 2 or 3 gives; null for any other key. */
export const statusOfKey = (key: string): MarkStatus | null =>
  key === "1"
    ? "FULL"
    : key === "2"
      ? "INCOMPLETE"
      : key === "3"
        ? "ABSENT"
        : null;

/** The row the arrow keys move to, held within the list. */
export const nextRow = (
  current: number,
  key: string,
  count: number
): number | null => {
  if (count === 0) return null;
  if (key === "ArrowDown") return Math.min(current + 1, count - 1);
  if (key === "ArrowUp") return Math.max(current - 1, 0);
  return null;
};

/** A note as tedrisat keeps it: trimmed, blank is none. */
export const noteBody = (note: string): string | null => note.trim() || null;

/** "12/30 girildi": how many of the exam's talebe have a result, of all of them. */
export function enteredCount(
  board: Pick<EvaluationBoard, "talebe" | "results">,
  lessonId: string
): { entered: number; total: number } {
  const entered = board.talebe.filter((t) =>
    board.results.has(markKey(lessonId, t.id))
  ).length;
  return { entered, total: board.talebe.length };
}

/**
 * A score as typed in an exam's box: a whole number from 0 to `max`.
 * `empty` for a blank box (nothing to save), `over` above "tam puan",
 * `invalid` for anything else.
 */
export function parseScore(
  typed: string,
  max: number
):
  | { kind: "score"; score: number }
  | { kind: "empty" }
  | { kind: "over" }
  | { kind: "invalid" } {
  const value = typed.trim();
  if (value === "") return { kind: "empty" };
  if (!/^\d+$/.test(value)) return { kind: "invalid" };
  const score = Number(value);
  return score > max ? { kind: "over" } : { kind: "score", score };
}

/** Where "Excel indir" downloads the board, through this app. */
export const evaluationExportHref = (courseId: string): string =>
  `/api/files/courses/${encodeURIComponent(courseId)}/evaluations`;
