// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type {
  MyQuestionNoteListItemResponse,
  MyQuestionNoteResponse,
  PracticeAttemptResponse,
} from "@medaris/services/tedrisat";
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  noteErrorOf,
  noteLookOf,
  notesCourseOf,
  notesHref,
  showsNote,
  sortNotes,
} from "~/features/question-notes/note-model";
import { cleanup, click, key, render, settle } from "./dom";
import { intlMock } from "./intl-mock";

/**
 * Soru notları on tedris (MDRS-248): the note icon of a question, only where
 * the hoca allows notes or one was written; its panel writes, sends and
 * deletes the note at once and says why it could not; an exam keeps the note
 * to the talebe until it is over; a result card shows the note and the
 * hoca's answer; "Notlarım" lists a course's notes, the new answers first.
 */

const notes = vi.hoisted(() => ({
  saveMyQuestionNote: vi.fn(),
  deleteMyQuestionNote: vi.fn(),
}));
const practice = vi.hoisted(() => ({
  startPractice: vi.fn(),
  startPracticePool: vi.fn(),
  savePracticeChoice: vi.fn(),
  finishPractice: vi.fn(),
}));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("next-intl", async (orig) => intlMock(await orig()));
vi.mock("next-intl/server", () => {
  const lookupIn =
    (namespace: string) =>
    (key: string, values: Record<string, unknown> = {}) =>
      Object.entries(values).reduce(
        (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
        [...namespace.split(".").slice(1), ...key.split(".")].reduce<unknown>(
          (node, part) => (node as Record<string, unknown>)?.[part],
          resources.tr.tedris
        ) as string
      );
  return {
    getTranslations: async (namespace: string) => lookupIn(namespace),
    getLocale: async () => "tr",
    getTimeZone: async () => "Europe/Istanbul",
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("~/lib/send-to-sign-in", () => ({ sendToSignIn: () => false }));
vi.mock("~/features/question-notes/actions", () => notes);
vi.mock("~/features/practice/actions", () => practice);

const ok = <T>(data: T) => ({ success: true as const, data });

const note = (
  over: Partial<MyQuestionNoteResponse> = {}
): MyQuestionNoteResponse => ({
  id: "n1",
  body: "Elif neden mansub?",
  sharedWithTeacher: false,
  sharedAt: null,
  teacherReply: null,
  repliedAt: null,
  newReply: false,
  updatedAt: new Date("2026-11-27T10:00:00Z"),
  ...over,
});

const attempt = (): PracticeAttemptResponse => ({
  id: "a1",
  setId: "s1",
  poolMode: null,
  courseId: "c1",
  title: "Birinci bab",
  status: "IN_PROGRESS",
  startedAt: new Date(),
  finishedAt: null,
  currentQuestionId: null,
  questions: [
    {
      id: "q1",
      number: 1,
      text: "Birinci soru",
      answerMode: "SINGLE",
      setTitle: "Birinci bab",
      options: [
        { id: "a", text: "Elif" },
        { id: "b", text: "Be" },
      ],
      chosenOptionIds: [],
      talebeNotes: true,
      myNote: null,
    },
    {
      id: "q2",
      number: 2,
      text: "İkinci soru",
      answerMode: "SINGLE",
      setTitle: "Birinci bab",
      options: [
        { id: "c", text: "Cim" },
        { id: "d", text: "Dal" },
      ],
      chosenOptionIds: [],
      talebeNotes: false,
      myNote: null,
    },
  ],
  result: null,
});

const button = (label: string) =>
  [...document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement;
const icon = () =>
  document.querySelector(
    "[data-testid=question-note-button]"
  ) as HTMLButtonElement | null;
const panel = () =>
  document.querySelector(
    "[data-testid=question-note-panel]"
  ) as HTMLElement | null;
const textarea = () =>
  (panel()?.querySelector("textarea") ?? null) as HTMLTextAreaElement;
const toggle = () => panel()?.querySelector('[role="switch"]') as HTMLElement;

/** What a person presses: the switch's label text. */
const flip = () =>
  click(
    toggle()
      .closest(".mds-choice")
      ?.querySelector(".mds-choice__label") as Element
  );

/** Types into a controlled textarea as a person would. */
async function type(el: HTMLTextAreaElement, value: string) {
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const mountPractice = async () => {
  const { PracticeTake } = await import(
    "~/features/practice/components/practice-take"
  );
  const host = await render(createElement(PracticeTake, { setId: "s1" }));
  await settle();
  return host;
};

const mountNote = async (
  props: Partial<{
    note: MyQuestionNoteResponse | null;
    enabled: boolean;
    shareLock: boolean;
  }> = {}
) => {
  const { QuestionNote } = await import(
    "~/features/question-notes/components/question-note"
  );
  const onChange = vi.fn();
  const host = await render(
    createElement(
      "div",
      { className: "question-note-anchor" },
      createElement(QuestionNote, {
        questionId: "q1",
        questionNumber: 1,
        note: props.note ?? null,
        onChange,
        enabled: props.enabled ?? true,
        shareLock: props.shareLock ?? false,
      })
    )
  );
  return { host, onChange };
};

beforeEach(() => {
  window.sessionStorage.clear();
  for (const m of [...Object.values(notes), ...Object.values(practice)])
    m.mockReset();
});
afterEach(cleanup);

describe("the note icon on the solving screen (soru notları)", () => {
  it("shows only on a question the hoca allows notes on", async () => {
    practice.startPractice.mockResolvedValue(ok(attempt()));
    await mountPractice();
    expect(icon()).not.toBeNull();
    expect(icon()?.getAttribute("aria-label")).toBe("1. soruya not yaz");
    expect(icon()?.dataset.look).toBe("empty");
    // The icon sits in the question's top line, not among the options.
    expect(icon()?.closest(".question-note-anchor")).not.toBeNull();
    await click(button("Sonraki"));
    expect(document.body.textContent).toContain("İkinci soru");
    expect(icon()).toBeNull();
  });

  it("shows a note written before the hoca turned notes off, to read and delete", async () => {
    const a = attempt();
    a.questions[1].myNote = note();
    practice.startPractice.mockResolvedValue(ok(a));
    await mountPractice();
    await click(button("Sonraki"));
    expect(icon()?.dataset.look).toBe("written");
    await click(icon() as HTMLButtonElement);
    expect(panel()?.textContent).toContain("Hocan bu soruda notları kapattı.");
    expect(panel()?.textContent).toContain("Elif neden mansub?");
    expect(textarea()).toBeNull();
    expect(button("Sil")).toBeDefined();
    expect(button("Kaydet")).toBeUndefined();
  });

  it("opens a panel that takes the focus, saves and sends the note at once, and closes with Esc", async () => {
    practice.startPractice.mockResolvedValue(ok(attempt()));
    await mountPractice();
    const open = icon() as HTMLButtonElement;
    await click(open);
    expect(open.getAttribute("aria-expanded")).toBe("true");
    expect(panel()?.getAttribute("role")).toBe("dialog");
    expect(open.getAttribute("aria-controls")).toBe(panel()?.id);
    expect(document.activeElement).toBe(textarea());
    // Empty, or quoting Arabic: the page's direction (MDRS-248).
    expect(textarea().hasAttribute("dir")).toBe(false);
    expect(textarea().maxLength).toBe(1000);
    // Nothing to save yet.
    expect(
      button("Kaydet").getAttribute("aria-disabled") === "true" ||
        button("Kaydet").disabled
    ).toBe(true);

    await type(textarea(), "  Elif neden mansub?  ");
    expect(panel()?.textContent).toContain("22/1000");
    await flip();
    notes.saveMyQuestionNote.mockResolvedValue(
      ok(note({ sharedWithTeacher: true, sharedAt: new Date() }))
    );
    await click(button("Kaydet"));
    await settle();
    expect(notes.saveMyQuestionNote).toHaveBeenCalledWith(
      "q1",
      "Elif neden mansub?",
      true
    );
    expect(panel()?.textContent).toContain("Notun kaydedildi.");
    expect(icon()?.dataset.look).toBe("written");

    // The question screen's keys leave the note's text alone.
    await key(textarea(), "a");
    expect(practice.savePracticeChoice).not.toHaveBeenCalled();

    await key(textarea(), "Escape");
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(icon());
    expect(icon()?.getAttribute("aria-expanded")).toBe("false");
  });

  it("deletes the note, and says so when a save fails", async () => {
    const a = attempt();
    a.questions[0].myNote = note();
    practice.startPractice.mockResolvedValue(ok(a));
    await mountPractice();
    await click(icon() as HTMLButtonElement);
    expect(textarea().value).toBe("Elif neden mansub?");

    notes.saveMyQuestionNote.mockResolvedValue({
      success: false,
      error: "down",
      status: 503,
    });
    await type(textarea(), "Elif neden mansub? Fiilden mi?");
    await click(button("Kaydet"));
    await settle();
    expect(panel()?.querySelector("[role=alert]")?.textContent).toBe(
      "Notun kaydedilemedi, tekrar dene."
    );

    notes.deleteMyQuestionNote.mockResolvedValue(ok(undefined));
    await click(button("Sil"));
    await settle();
    expect(notes.deleteMyQuestionNote).toHaveBeenCalledWith("q1");
    expect(panel()?.textContent).toContain("Notun silindi.");
    expect(icon()?.dataset.look).toBe("empty");
    expect(button("Sil")).toBeUndefined();
  });
});

describe("an exam's notes (soru notları)", () => {
  it("keeps the note to the talebe during the exam: the switch is off and says why", async () => {
    await mountNote({ shareLock: true });
    await click(icon() as HTMLButtonElement);
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(
      toggle().hasAttribute("data-disabled") ||
        toggle().getAttribute("aria-disabled") === "true"
    ).toBe(true);
    expect(panel()?.textContent).toContain(
      "Sınav bitince hocana gönderebilirsin; şimdilik not yalnız sende."
    );
    notes.saveMyQuestionNote.mockResolvedValue(ok(note()));
    await type(textarea(), "Kendime not");
    await click(button("Kaydet"));
    await settle();
    expect(notes.saveMyQuestionNote).toHaveBeenCalledWith(
      "q1",
      "Kendime not",
      false
    );
  });

  it("locks the switch when the API says the exam is not over", async () => {
    await mountNote();
    await click(icon() as HTMLButtonElement);
    await type(textarea(), "Hocama soru");
    await flip();
    notes.saveMyQuestionNote.mockResolvedValue({
      success: false,
      error: "locked",
      status: 409,
      code: "NOTES_SHARE_LOCKED",
    });
    await click(button("Kaydet"));
    await settle();
    expect(panel()?.querySelector("[role=alert]")?.textContent).toBe(
      "Sınav bitmeden notunu hocana gönderemezsin. Kişisel not olarak kaydedebilirsin."
    );
    expect(toggle().getAttribute("aria-checked")).toBe("false");
  });

  it("says the hoca turned notes off, and stops writing", async () => {
    await mountNote();
    await click(icon() as HTMLButtonElement);
    await type(textarea(), "Bir not");
    notes.saveMyQuestionNote.mockResolvedValue({
      success: false,
      error: "off",
      status: 409,
      code: "NOTES_DISABLED",
    });
    await click(button("Kaydet"));
    await settle();
    expect(panel()?.querySelector("[role=alert]")?.textContent).toContain(
      "Hocan bu soruda notları kapattı."
    );
    expect(textarea()).toBeNull();
  });
});

describe("the panel keeps what the talebe wrote (soru notları)", () => {
  it("keeps a draft across an outside press, and Esc closes it from the icon too", async () => {
    await mountNote();
    await click(icon() as HTMLButtonElement);
    await type(textarea(), "Yarım kalan not");
    await act(async () => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(panel()).toBeNull();
    await click(icon() as HTMLButtonElement);
    expect(textarea().value).toBe("Yarım kalan not");
    // The focus back on the icon, the panel still open: Esc closes it.
    (icon() as HTMLButtonElement).focus();
    await key(icon() as HTMLButtonElement, "Escape");
    expect(panel()).toBeNull();
  });

  it("does not save an unchanged note with Ctrl+Enter", async () => {
    await mountNote({ note: note() });
    await click(icon() as HTMLButtonElement);
    await act(async () => {
      textarea().dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        })
      );
    });
    await settle();
    expect(notes.saveMyQuestionNote).not.toHaveBeenCalled();
  });

  it("keeps a sent note sent while sending is locked", async () => {
    const sent = note({ sharedWithTeacher: true, sharedAt: new Date() });
    await mountNote({ note: sent, shareLock: true });
    await click(icon() as HTMLButtonElement);
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    notes.saveMyQuestionNote.mockResolvedValue(ok(sent));
    await type(textarea(), "Elif neden mansub? Bir daha baktım.");
    await click(button("Kaydet"));
    await settle();
    expect(notes.saveMyQuestionNote).toHaveBeenCalledWith(
      "q1",
      "Elif neden mansub? Bir daha baktım.",
      true
    );
  });

  it("asks before deleting a note the hoca answered", async () => {
    await mountNote({
      note: note({
        sharedWithTeacher: true,
        sharedAt: new Date(),
        teacherReply: "Cevap",
        repliedAt: new Date(),
      }),
    });
    await click(icon() as HTMLButtonElement);
    await click(button("Sil"));
    expect(notes.deleteMyQuestionNote).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      "Hocanın cevabı da notla birlikte silinir."
    );
    notes.deleteMyQuestionNote.mockResolvedValue(ok(undefined));
    const confirm = [
      ...document.querySelectorAll("[role=alertdialog] button"),
    ].find((b) => b.textContent?.trim() === "Sil") as HTMLButtonElement;
    await click(confirm);
    await settle();
    expect(notes.deleteMyQuestionNote).toHaveBeenCalledWith("q1");
  });
});

describe("a result card's note (soru notları)", () => {
  it("shows the note, whether it was sent and the hoca's answer, and opens it to edit", async () => {
    const { AnswerReview } = await import(
      "~/features/online-exams/components/answer-review"
    );
    await render(
      createElement(AnswerReview, {
        heading: "Cevapların",
        headingId: "answers",
        cardTestId: "practice-answer",
        items: [
          {
            id: "q1",
            number: 1,
            text: "Birinci soru",
            outcome: "wrong",
            options: [
              { id: "a", text: "Elif", chosen: true, correct: false },
              { id: "b", text: "Be", chosen: false, correct: true },
            ],
            note: {
              enabled: true,
              initial: note({
                sharedWithTeacher: true,
                sharedAt: new Date(),
                teacherReply: "Fiilin mef'ûlüdür.",
                repliedAt: new Date(),
                newReply: true,
              }),
            },
          },
          {
            id: "q2",
            number: 2,
            text: "İkinci soru",
            outcome: "correct",
            options: [{ id: "c", text: "Cim", chosen: true, correct: true }],
            note: null,
          },
        ],
      })
    );
    const cards = document.querySelectorAll("[data-testid=practice-answer]");
    const summary = cards[0].querySelector(
      "[data-testid=question-note-summary]"
    );
    expect(summary?.textContent).toContain("Elif neden mansub?");
    expect(summary?.textContent).toContain("Hocaya gönderildi");
    expect(summary?.textContent).toContain("Hocanın cevabı:");
    expect(summary?.textContent).toContain("Fiilin mef'ûlüdür.");
    expect(summary?.textContent).toContain("Yeni cevap");
    const first = cards[0].querySelector(
      "[data-testid=question-note-button]"
    ) as HTMLButtonElement;
    expect(first.dataset.look).toBe("newReply");
    expect(first.querySelector(".question-note__dot")).not.toBeNull();
    // Notes off and none written: no icon, no summary.
    expect(
      cards[1].querySelector("[data-testid=question-note-button]")
    ).toBeNull();

    await click(first);
    expect(panel()?.textContent).toContain("Fiilin mef'ûlüdür.");
    expect(textarea().value).toBe("Elif neden mansub?");
  });
});

describe("Notlarım (soru notları)", () => {
  const item = (
    over: Partial<MyQuestionNoteListItemResponse>
  ): MyQuestionNoteListItemResponse => ({
    ...note(),
    questionId: "q1",
    questionText: "Birinci soru",
    examId: "s1",
    examKind: "PRACTICE",
    setTitle: "Birinci bab",
    lessonId: null,
    createdAt: new Date("2026-11-26T10:00:00Z"),
    ...over,
  });

  it("lists a course's notes, the new answers first and marked", async () => {
    const { MyNotesPage } = await import(
      "~/features/question-notes/components/my-notes-page"
    );
    const html = renderToStaticMarkup(
      await MyNotesPage({
        courseTitle: "Emsile",
        read: {
          status: "ok",
          notes: [
            item({ id: "old", body: "Kişisel bir not" }),
            item({
              id: "new",
              body: "Hocama sorum",
              questionText: "مَا مَعْنَى نَصَرَ",
              sharedWithTeacher: true,
              sharedAt: new Date(),
              teacherReply: "Yardım etti.",
              repliedAt: new Date(),
              newReply: true,
              updatedAt: new Date("2026-11-20T10:00:00Z"),
            }),
            item({
              id: "exam",
              body: "Sınavdaki not",
              examId: "e1",
              examKind: "EXAM",
              setTitle: "Ara sınav",
              lessonId: "l1",
              sharedWithTeacher: true,
              sharedAt: new Date(),
            }),
          ],
        },
      })
    );
    const host = document.createElement("div");
    host.innerHTML = html;
    expect(host.querySelector("h1")?.textContent).toBe("Soru notlarım");
    expect(host.textContent).toContain("Emsile");
    const items = [...host.querySelectorAll("[data-testid=notes-item]")];
    expect(items).toHaveLength(3);
    expect(items[0].getAttribute("data-new-reply")).toBe("true");
    expect(items[0].textContent).toContain("Hocama sorum");
    expect(items[0].textContent).toContain("Hocanın cevabı:");
    expect(items[0].textContent).toContain("Yardım etti.");
    expect(items[0].textContent).toContain("Yeni cevap");
    // An Arabic question by the Arabic text standard.
    expect(items[0].querySelector('[lang="ar"]')?.getAttribute("dir")).toBe(
      "rtl"
    );
    expect(items[1].getAttribute("data-new-reply")).toBeNull();
    const personal = items.find((i) => i.textContent?.includes("Kişisel"));
    expect(personal?.textContent).toContain("Yalnız sende");
    const exam = items.find((i) => i.textContent?.includes("Sınavdaki"));
    expect(exam?.textContent).toContain("Hocaya gönderildi");
    expect(exam?.textContent).toContain("Hocan henüz cevaplamadı.");
    expect(exam?.querySelector("a[href='/my-exams/l1']")?.textContent).toBe(
      "Sınav sonucunu aç"
    );
    expect(
      personal?.querySelector("a[href='/calisma-sorulari/s1']")
    ).not.toBeNull();
  });

  it("says when there is no note, and when the course cannot be read", async () => {
    const { MyNotesPage } = await import(
      "~/features/question-notes/components/my-notes-page"
    );
    expect(
      renderToStaticMarkup(
        await MyNotesPage({
          courseTitle: null,
          read: { status: "ok", notes: [] },
        })
      )
    ).toContain("Bu derste henüz soru notun yok.");
    expect(
      renderToStaticMarkup(
        await MyNotesPage({ courseTitle: null, read: { status: "absent" } })
      )
    ).toContain("Bu dersin talebesi değilsin");
    expect(
      renderToStaticMarkup(await MyNotesPage({ courseTitle: null, read: null }))
    ).toContain("Bu dersin notları açılamadı");
  });

  it("leads from the list page's course to its notes", async () => {
    const { PracticeListPage } = await import(
      "~/features/practice/components/practice-list-page"
    );
    const html = renderToStaticMarkup(
      await PracticeListPage({
        sets: [
          {
            id: "s1",
            courseId: "c1",
            courseTitle: "Emsile",
            title: "Birinci bab",
            instructions: null,
            questionCount: 10,
            attemptCount: 0,
            lastPercent: null,
            openAttemptId: null,
            publishedAt: new Date(),
          },
        ],
      })
    );
    const host = document.createElement("div");
    host.innerHTML = html;
    const link = host.querySelector("[data-testid=practice-notes-link]");
    expect(link?.getAttribute("href")).toBe("/calisma-sorulari/notlar?ders=c1");
    expect(link?.textContent).toContain("Notlarım");
    expect(link?.getAttribute("aria-label")).toBe(
      "Notlarım: Emsile dersindeki soru notların"
    );
  });
});

describe("the note model (soru notları)", () => {
  it("shows the icon where notes are on or one was written", () => {
    expect(showsNote({ talebeNotes: true, myNote: null })).toBe(true);
    expect(showsNote({ talebeNotes: false, myNote: note() })).toBe(true);
    expect(showsNote({ talebeNotes: false, myNote: null })).toBe(false);
    expect(showsNote({})).toBe(false);
  });

  it("looks empty, written, answered, or answered and not read", () => {
    expect(noteLookOf(null)).toBe("empty");
    expect(noteLookOf(note())).toBe("written");
    expect(noteLookOf(note({ teacherReply: "x" }))).toBe("replied");
    expect(noteLookOf(note({ teacherReply: "x", newReply: true }))).toBe(
      "newReply"
    );
  });

  it("words each refusal", () => {
    expect(noteErrorOf({ code: "NOTES_DISABLED" }, "save")).toBe("disabled");
    expect(noteErrorOf({ code: "NOTES_SHARE_LOCKED" }, "save")).toBe(
      "shareLocked"
    );
    expect(noteErrorOf({ code: "NOTE_QUESTION_NOT_FOUND" }, "save")).toBe(
      "notFound"
    );
    expect(noteErrorOf({ status: 403 }, "save")).toBe("forbidden");
    expect(noteErrorOf({ status: 503 }, "save")).toBe("saveFailed");
    expect(noteErrorOf({ status: 503 }, "delete")).toBe("deleteFailed");
  });

  it("finds the course of a notes page, and orders its notes", () => {
    expect(notesHref("c 1")).toBe("/calisma-sorulari/notlar?ders=c%201");
    expect(notesCourseOf({ ders: "c1" })).toBe("c1");
    expect(notesCourseOf({ ders: ["c1", "c2"] })).toBe("c1");
    expect(notesCourseOf({})).toBeNull();
    expect(notesCourseOf({ ders: " " })).toBeNull();
    const at = (iso: string) => new Date(iso);
    const sorted = sortNotes([
      { id: "a", newReply: false, updatedAt: at("2026-11-01T00:00:00Z") },
      { id: "b", newReply: false, updatedAt: at("2026-11-02T00:00:00Z") },
      { id: "c", newReply: true, updatedAt: at("2026-10-01T00:00:00Z") },
    ]);
    expect(sorted.map((n) => n.id)).toEqual(["c", "b", "a"]);
  });
});
