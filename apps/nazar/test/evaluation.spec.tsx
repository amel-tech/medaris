// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type EvaluationBoard as Board,
  boardOf,
  fullCount,
  markKey,
  nextRow,
  noteBody,
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

const actions = vi.hoisted(() => ({ saveEvaluation: vi.fn() }));
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
      // A kind this page does not know yet is skipped.
      {
        kind: "EXAM",
        lessonId: "l-3",
        title: "Ara sınav",
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
        <EvaluationBoard initial={board} />
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
    expect(text).not.toContain("Ara sınav");
    expect(text).toContain(tr.full);
    expect(text).toContain(tr.incomplete);
    expect(text).toContain(tr.pending);
    expect(text).toContain(tr.unnamed);
  });

  it("says there is nothing to mark without a memorisation homework", async () => {
    await mount({ columns: [], talebe: [], marks: new Map() });
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

  it("puts the mark back and says so when the save never reaches tedrisat", async () => {
    actions.saveEvaluation.mockRejectedValue(new Error("offline"));
    await mount();
    await open();
    await click(buttonIn(row("t-3"), tr.absent));
    await settle(40);
    expect(pressed("t-3")).toEqual([]);
    expect(document.body.textContent).toContain(tr.saveFailed);
    // The same press goes out again rather than being taken for a no-op.
    await click(buttonIn(row("t-3"), tr.absent));
    await settle();
    expect(actions.saveEvaluation).toHaveBeenCalledTimes(2);
  });

  it("sends a cell's presses one after another, and a late failure does not undo the newer one", async () => {
    let fail: (value: unknown) => void = () => {};
    actions.saveEvaluation.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          fail = resolve;
        })
    );
    await mount();
    await open();
    await click(buttonIn(row("t-1"), tr.incomplete));
    await click(buttonIn(row("t-1"), tr.absent));
    await settle();
    expect(pressed("t-1")).toEqual([tr.absent]);
    // The second press waits for the first.
    expect(actions.saveEvaluation).toHaveBeenCalledTimes(1);
    fail({ success: false, code: "INTERNAL" });
    await settle(40);
    expect(actions.saveEvaluation).toHaveBeenCalledTimes(2);
    expect(actions.saveEvaluation).toHaveBeenLastCalledWith(
      L1,
      "t-1",
      "ABSENT",
      null
    );
    expect(pressed("t-1")).toEqual([tr.absent]);
    expect(document.body.textContent).toContain(tr.saveFailed);
  });

  it("goes back to what tedrisat last kept when every press on a cell fails", async () => {
    actions.saveEvaluation.mockResolvedValue({
      success: false,
      code: "INTERNAL",
    });
    await mount();
    await open();
    await click(buttonIn(row("t-1"), tr.incomplete));
    await click(buttonIn(row("t-1"), tr.absent));
    await settle(40);
    expect(pressed("t-1")).toEqual([tr.full]);
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
