// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type EvaluationBoard as Board,
  boardOf,
  enteredCount,
  evaluationExportHref,
  fullCount,
  markKey,
  nextRow,
  noteBody,
  parseScore,
  statusOfKey,
} from "~/features/evaluation/evaluation";
import { cleanup, click, key, render, settle, type as typeInto } from "./dom";

/**
 * "Değerlendirme" (MDRS-248): the course's talebe marked on the homework
 * recited to the müderris. Closed, the board is a row per talebe and a column
 * per homework; a column opened is one screen of rows with Tam · Eksik ·
 * Vermedi, an optional note, "N/M tam" above, and ↑ ↓ 1 2 3 on the keyboard.
 * The action is a stub.
 */

const actions = vi.hoisted(() => ({
  saveEvaluation: vi.fn(),
  saveExamResult: vi.fn(),
  releaseExamResults: vi.fn(),
}));
vi.mock("~/features/evaluation/actions", () => actions);
vi.mock("~/lib/unauthenticated", () => ({
  handleUnauthenticated: (result: unknown) =>
    (result as { kind?: unknown } | null)?.kind === "unauthenticated",
}));

const tr = resources.tr.nazar.Evaluation;
const L1 = "l-1";
const L2 = "l-2";

const response = () =>
  ({
    columns: [
      {
        kind: "MEMORIZE",
        lessonId: L1,
        title: "Emsile, birinci bab",
        weekNumber: 1,
        scheduledAt: null,
        description: null,
        fullCount: 1,
      },
      {
        kind: "MEMORIZE",
        lessonId: L2,
        title: "Emsile, ikinci bab",
        weekNumber: 2,
        scheduledAt: null,
        description: null,
        fullCount: 0,
      },
      // A kind this page does not know is skipped.
      {
        kind: "QUIZ",
        lessonId: "l-3",
        title: "Kısa yoklama",
        weekNumber: 3,
        scheduledAt: null,
        description: null,
        fullCount: 0,
      },
    ],
    talebe: [
      { id: "t-1", name: "Ahmet Talebe" },
      { id: "t-2", name: "Zeynep Talebe" },
      { id: "t-3", name: null },
    ],
    marks: [
      {
        lessonId: L1,
        userId: "t-1",
        status: "FULL",
        note: null,
        updatedAt: new Date(),
      },
      {
        lessonId: L1,
        userId: "t-2",
        status: "INCOMPLETE",
        note: "Son satır.",
        updatedAt: new Date(),
      },
    ],
  }) as never;

const mount = async (board: Board = boardOf(response())) => {
  const { EvaluationBoard } = await import(
    "~/features/evaluation/components/evaluation-board"
  );
  await render(
    <NextIntlClientProvider
      locale="tr"
      timeZone="Europe/Istanbul"
      messages={{ nazar: resources.tr.nazar }}
    >
      <ToastProvider>
        <EvaluationBoard initial={board} courseId="c-1" />
        <Toaster />
      </ToastProvider>
    </NextIntlClientProvider>
  );
  await settle();
};

const buttonIn = (root: ParentNode, label: string) =>
  [...root.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement;
const row = (id: string) =>
  document.querySelector(`[data-testid="evaluation-row-${id}"]`) as HTMLElement;
const count = () =>
  document.querySelector('[data-testid="evaluation-count"]')?.textContent;
const pressed = (id: string) =>
  [...row(id).querySelectorAll('button[aria-pressed="true"]')].map((b) =>
    b.textContent?.trim()
  );
const open = async (lessonId = L1) => {
  await click(
    document.querySelector(
      `[data-testid="evaluation-open-${lessonId}"]`
    ) as HTMLElement
  );
  await settle();
};

beforeEach(() => {
  actions.saveExamResult.mockReset();
  actions.saveExamResult.mockImplementation(async () => ({
    success: true,
    data: {},
  }));
  actions.releaseExamResults.mockReset();
  actions.releaseExamResults.mockResolvedValue({ success: true, data: {} });
  actions.saveEvaluation.mockReset();
  actions.saveEvaluation.mockImplementation(
    async (
      lessonId: string,
      userId: string,
      status: string,
      note: unknown
    ) => ({
      success: true,
      data: { lessonId, userId, status, note, updatedAt: new Date() },
    })
  );
});
afterEach(async () => {
  await cleanup();
});

describe("the rules of Değerlendirme", () => {
  it("draws the columns it knows, the talebe and the marks", () => {
    const board = boardOf(response());
    expect(board.columns.map((c) => c.lessonId)).toEqual([L1, L2]);
    expect(board.talebe).toHaveLength(3);
    expect(board.marks.get(markKey(L1, "t-2"))).toEqual({
      status: "INCOMPLETE",
      note: "Son satır.",
    });
    expect(fullCount(board, L1)).toEqual({ full: 1, total: 3 });
    expect(fullCount(board, L2)).toEqual({ full: 0, total: 3 });
  });

  it("reads 1, 2, 3 as the three marks and the arrows as rows, held within the list", () => {
    expect(["1", "2", "3", "4", "a"].map(statusOfKey)).toEqual([
      "FULL",
      "INCOMPLETE",
      "ABSENT",
      null,
      null,
    ]);
    expect(nextRow(0, "ArrowDown", 3)).toBe(1);
    expect(nextRow(2, "ArrowDown", 3)).toBe(2);
    expect(nextRow(0, "ArrowUp", 3)).toBe(0);
    expect(nextRow(1, "Enter", 3)).toBeNull();
    expect(nextRow(0, "ArrowDown", 0)).toBeNull();
  });

  it("keeps a trimmed note, and none for a blank one", () => {
    expect(noteBody("  Güzel.  ")).toBe("Güzel.");
    expect(noteBody("   ")).toBeNull();
  });
});

describe("the board", () => {
  it("shows every talebe's mark per homework, Bekliyor where there is none", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toContain("1. hafta · Emsile, birinci bab");
    expect(text).toContain("2. hafta · Emsile, ikinci bab");
    expect(text).not.toContain("Kısa yoklama");
    expect(text).toContain(tr.full);
    expect(text).toContain(tr.incomplete);
    expect(text).toContain(tr.pending);
    expect(text).toContain(tr.unnamed);
  });

  it("says there is nothing to mark without a memorisation homework", async () => {
    await mount({
      columns: [],
      talebe: [],
      marks: new Map(),
      results: new Map(),
    });
    expect(document.body.textContent).toContain(tr.noColumns);
  });

  it("opens a column on one screen with the count, and marks a row at once with a press", async () => {
    await mount();
    await open();
    expect(count()).toBe("1/3 tam");
    expect(pressed("t-1")).toEqual([tr.full]);
    expect(pressed("t-3")).toEqual([]);
    await click(buttonIn(row("t-3"), tr.full));
    await settle();
    expect(actions.saveEvaluation).toHaveBeenCalledWith(
      L1,
      "t-3",
      "FULL",
      null
    );
    expect(pressed("t-3")).toEqual([tr.full]);
    expect(count()).toBe("2/3 tam");
  });

  it("moves with the arrows and marks the row in focus with 1, 2 and 3", async () => {
    await mount();
    await open();
    const list = row("t-1").parentElement as HTMLElement;
    row("t-1").focus();
    await key(row("t-1"), "ArrowDown");
    expect(document.activeElement).toBe(row("t-2"));
    await key(row("t-2"), "3");
    await settle();
    expect(actions.saveEvaluation).toHaveBeenCalledWith(
      L1,
      "t-2",
      "ABSENT",
      "Son satır."
    );
    expect(pressed("t-2")).toEqual([tr.absent]);
    await key(row("t-2"), "ArrowUp");
    await key(row("t-1"), "2");
    await settle();
    expect(pressed("t-1")).toEqual([tr.incomplete]);
    expect(count()).toBe("0/3 tam");
    expect(list.contains(document.activeElement)).toBe(true);
  });

  it("saves a note when it leaves the field, and not before a mark", async () => {
    await mount();
    await open();
    const empty = row("t-3").querySelector("input") as HTMLInputElement;
    expect(empty.disabled).toBe(true);
    const note = row("t-1").querySelector("input") as HTMLInputElement;
    await typeInto(note, "  Çok güzel.  ");
    await key(note, "Enter");
    note.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    await settle();
    expect(actions.saveEvaluation).toHaveBeenCalledWith(
      L1,
      "t-1",
      "FULL",
      "Çok güzel."
    );
  });

  it("puts the mark back and says so when it could not be saved", async () => {
    actions.saveEvaluation.mockResolvedValue({
      success: false,
      code: "EVALUATION_TALEBE_NOT_FOUND",
    });
    await mount();
    await open();
    await click(buttonIn(row("t-3"), tr.absent));
    await settle(40);
    expect(pressed("t-3")).toEqual([]);
    expect(document.body.textContent).toContain(tr.saveFailed);
  });

  it("goes back to the whole board", async () => {
    await mount();
    await open(L2);
    expect(count()).toBe("0/3 tam");
    await click(buttonIn(document.body, tr.back));
    expect(
      document.querySelector('[data-testid="evaluation-column"]')
    ).toBeNull();
  });
});

/** An exam column (MDRS-248): "Ara sınav" out of 100, t-1 holding 70. */
const examResponse = () =>
  ({
    columns: [
      {
        kind: "EXAM",
        lessonId: "x-1",
        title: "Ara sınav",
        weekNumber: 4,
        scheduledAt: null,
        description: null,
        fullCount: 1,
        exam: {
          format: "WRITTEN",
          maxScore: 100,
          isRetake: false,
          resultsReleasedAt: null,
        },
      },
      {
        kind: "EXAM",
        lessonId: "x-2",
        title: "Telafi",
        weekNumber: 5,
        scheduledAt: null,
        description: null,
        fullCount: 0,
        exam: {
          format: "ORAL",
          maxScore: 20,
          isRetake: true,
          resultsReleasedAt: new Date("2026-11-01T10:00:00Z"),
        },
      },
    ],
    talebe: [
      { id: "t-1", name: "Ahmet Talebe" },
      { id: "t-2", name: "Zeynep Talebe" },
    ],
    marks: [],
    results: [
      {
        lessonId: "x-1",
        userId: "t-1",
        score: 70,
        absent: false,
        updatedAt: new Date(),
      },
    ],
  }) as never;

const examRow = (id: string) =>
  document.querySelector(`[data-testid="exam-row-${id}"]`) as HTMLElement;
const scoreBox = (id: string) =>
  examRow(id).querySelector("input") as HTMLInputElement;

describe("exams on Değerlendirme", () => {
  it("reads a score as typed: whole, within tam puan, blank is nothing", () => {
    expect(parseScore("85", 100)).toEqual({ kind: "score", score: 85 });
    expect(parseScore(" 0 ", 100)).toEqual({ kind: "score", score: 0 });
    expect(parseScore("101", 100)).toEqual({ kind: "over" });
    expect(parseScore("12.5", 100)).toEqual({ kind: "invalid" });
    expect(parseScore("-3", 100)).toEqual({ kind: "invalid" });
    expect(parseScore("  ", 100)).toEqual({ kind: "empty" });
  });

  it("keeps the exam columns, their results and the make-up apart", () => {
    const board = boardOf(examResponse());
    expect(board.columns.map((c) => [c.kind, c.exam?.isRetake])).toEqual([
      ["EXAM", false],
      ["EXAM", true],
    ]);
    expect(board.columns[1].exam?.releasedAt).toBe("2026-11-01T10:00:00.000Z");
    expect(enteredCount(board, "x-1")).toEqual({ entered: 1, total: 2 });
    expect(evaluationExportHref("c-1")).toBe(
      "/api/files/courses/c-1/evaluations"
    );
  });

  it("shows the scores on the board and offers the spreadsheet", async () => {
    await mount(boardOf(examResponse()));
    const text = document.body.textContent ?? "";
    expect(text).toContain("70/100");
    expect(text).toContain(tr.examBadge);
    expect(text).toContain(tr.retakeBadge);
    const download = document.querySelector(
      '[data-testid="evaluation-download"]'
    ) as HTMLAnchorElement;
    expect(download.getAttribute("href")).toBe(
      "/api/files/courses/c-1/evaluations"
    );
  });

  it("refuses a score above tam puan, saves one within it with Enter and moves down", async () => {
    await mount(boardOf(examResponse()));
    await open("x-1");
    expect(
      document.querySelector('[data-testid="exam-count"]')?.textContent
    ).toBe("1/2 girildi");
    await typeInto(scoreBox("t-2"), "120");
    await key(scoreBox("t-2"), "Enter");
    await settle();
    expect(actions.saveExamResult).not.toHaveBeenCalled();
    expect(examRow("t-2").textContent).toContain("En çok 100 puan");

    await typeInto(scoreBox("t-1"), "85");
    await key(scoreBox("t-1"), "Enter");
    await settle();
    expect(actions.saveExamResult).toHaveBeenCalledWith("x-1", "t-1", {
      score: 85,
    });
    expect(document.activeElement).toBe(scoreBox("t-2"));
  });

  it("marks Girmedi and opens the results to the talebe", async () => {
    await mount(boardOf(examResponse()));
    await open("x-1");
    await click(buttonIn(examRow("t-2"), tr.absentExam));
    await settle();
    expect(actions.saveExamResult).toHaveBeenCalledWith("x-1", "t-2", {
      absent: true,
    });
    await click(
      document.querySelector('[data-testid="exam-release"]') as HTMLElement
    );
    await settle();
    expect(actions.releaseExamResults).toHaveBeenCalledWith("x-1");
    expect(
      document.querySelector('[data-testid="exam-released"]')
    ).not.toBeNull();
  });
});
