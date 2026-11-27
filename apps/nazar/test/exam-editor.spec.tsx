// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type { OnlineExamDraftResponse } from "@medaris/services/tedrisat";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ExamEditor,
  rowText,
} from "~/features/online-exams/components/exam-editor";
import {
  cleanup,
  click,
  key,
  render,
  rerender,
  settle,
  type as typeInto,
} from "./dom";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
  // As Next's: the error a call to a Server Action the server no longer has throws.
  unstable_isUnrecognizedActionError: (error: unknown) =>
    error instanceof Error && error.name === "UnrecognizedActionError",
}));

/** Server answers the test lets through when it wants. */
const held: Array<() => void> = [];
const later = <T,>(value: T) =>
  new Promise<T>((resolve) => held.push(() => resolve(value)));
const actions = {
  addExamQuestion: vi.fn(),
  saveExamQuestion: vi.fn(),
  removeExamQuestion: vi.fn(),
  createCourseTopic: vi.fn(),
  createOnlineExam: vi.fn(),
  setExamQuestionPoints: vi.fn(),
  removeCourseTopic: vi.fn(),
  saveExamSettings: vi.fn(),
  setExamQuestionTalebeNotes: vi.fn(),
};
vi.mock("~/features/online-exams/notes-actions", () => ({
  setExamQuestionTalebeNotes: (...a: unknown[]) =>
    actions.setExamQuestionTalebeNotes(...a),
  replyQuestionNote: vi.fn(),
}));
vi.mock("~/features/online-exams/actions", () => ({
  addExamQuestion: (...a: unknown[]) => actions.addExamQuestion(...a),
  saveExamQuestion: (...a: unknown[]) => actions.saveExamQuestion(...a),
  removeExamQuestion: (...a: unknown[]) => actions.removeExamQuestion(...a),
  createCourseTopic: (...a: unknown[]) => actions.createCourseTopic(...a),
  createOnlineExam: (...a: unknown[]) => actions.createOnlineExam(...a),
  setExamQuestionPoints: (...a: unknown[]) =>
    actions.setExamQuestionPoints(...a),
  removeCourseTopic: (...a: unknown[]) => actions.removeCourseTopic(...a),
  saveExamSettings: (...a: unknown[]) => actions.saveExamSettings(...a),
}));

const draft = {
  id: "e1",
  courseId: "c1",
  title: "Ara sınav",
  durationMinutes: 60,
  instructions: null,
  zerothQuestion: "",
  zerothOptions: [],
  courseTopics: [
    { id: "t3", number: 3, name: "Kıyas", picked: false, questionCount: 0 },
  ],
  topicIds: [],
  questions: [],
  pointsTotal: "0.00",
  status: "DRAFT",
  version: 1,
} as unknown as OnlineExamDraftResponse;

const wrap = (node: React.ReactNode) => (
  <NextIntlClientProvider
    locale="tr"
    timeZone="Europe/Istanbul"
    messages={{ nazar: resources.tr.nazar }}
  >
    <ToastProvider>
      {node}
      <Toaster />
    </ToastProvider>
  </NextIntlClientProvider>
);

afterEach(async () => {
  await cleanup();
  held.length = 0;
  vi.clearAllMocks();
});

/** The question form's text: the settings above it have a text area of their own. */
const QUESTION_TEXT = 'form[aria-label$=". soru"] textarea';

const button = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll("button")].find(
    (b) => b.textContent === label
  ) as HTMLButtonElement;

/** A topic's chip in the question form: a toggle button, pressed when picked. */
const topicChip = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll("form button[aria-pressed]")].find(
    (b) => b.textContent === label
  ) as HTMLButtonElement;

describe("the exam editor (MDRS-299)", () => {
  it("shows a saved question at once, and sends it in the background", async () => {
    actions.addExamQuestion.mockReturnValue(
      later({ success: true, data: { version: 2, question: { id: "q1" } } })
    );
    actions.saveExamQuestion.mockImplementation((_e, id, body) =>
      later({
        success: true,
        data: {
          version: 3,
          question: {
            id,
            number: 1,
            text: body.text,
            options: body.options.map((o: object, i: number) => ({
              id: `o${i}`,
              ...o,
            })),
            answerMode: "SINGLE",
            scoring: null,
            topicIds: body.topicIds,
            ownPoints: null,
            points: "100.00",
            complete: true,
            lacks: [],
          },
        },
      })
    );
    const root = await render(wrap(<ExamEditor courseId="c1" draft={draft} />));
    await click(button(root, "Soru ekle"));
    // The form opens with no call to the server.
    expect(actions.addExamQuestion).not.toHaveBeenCalled();
    const [text] = [...root.querySelectorAll(QUESTION_TEXT)];
    await typeInto(text, "Kıyasın rükünleri kaç tanedir?");
    const inputs = [...root.querySelectorAll("input")];
    await typeInto(
      inputs.find(
        (i) => i.getAttribute("aria-label") === "1. şık"
      ) as HTMLInputElement,
      "Üç"
    );
    await typeInto(
      inputs.find(
        (i) => i.getAttribute("aria-label") === "2. şık"
      ) as HTMLInputElement,
      "Dört"
    );
    await click(topicChip(root, "3. Kıyas"));
    await click(button(root, "Kaydet"));

    // On the list at once, saving, while the server has not answered.
    expect(root.textContent).toContain("Kıyasın rükünleri kaç tanedir?");
    expect(root.textContent).toContain("Kaydediliyor…");
    expect(button(root, "Soru ekle").disabled).toBe(false);

    held.shift()?.(); // the question is made
    await settle();
    held.shift()?.(); // and saved, naming the version the first write gave
    await settle();
    expect(actions.saveExamQuestion).toHaveBeenCalledWith(
      "e1",
      "q1",
      expect.objectContaining({ version: 2, topicIds: ["t3"] })
    );
    expect(root.textContent).not.toContain("Kaydediliyor…");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("keeps what was typed when the save fails, and offers it again", async () => {
    actions.addExamQuestion.mockResolvedValue({
      success: false,
      code: "SOMETHING",
    });
    const root = await render(wrap(<ExamEditor courseId="c1" draft={draft} />));
    await click(button(root, "Soru ekle"));
    await typeInto(
      root.querySelector(QUESTION_TEXT) as HTMLTextAreaElement,
      "Bir soru"
    );
    await click(button(root, "Kaydet"));
    await settle();
    expect(root.textContent).toContain("Bir soru");
    expect(root.textContent).toContain("Kaydedilemedi");
    expect(button(root, "Yeniden dene")).toBeTruthy();
  });

  // happy-dom here has no localStorage: a small one in memory.
  const memory = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => void memory.set(k, v),
      removeItem: (k: string) => void memory.delete(k),
      clear: () => memory.clear(),
    },
  });
  // A failed save in one test must not come back in the next.
  afterEach(() => memory.clear());

  it("says Medaris was updated when a save names a gone Server Action, and keeps the question for the reload", async () => {
    window.localStorage.clear();
    const gone = Object.assign(new Error("Server Action was not found"), {
      name: "UnrecognizedActionError",
    });
    actions.addExamQuestion.mockRejectedValue(gone);
    const root = await render(wrap(<ExamEditor courseId="c1" draft={draft} />));
    await click(button(root, "Soru ekle"));
    await typeInto(textOf(root), "Kalan soru");
    await click(button(root, "Kaydet"));
    await settle();
    expect(document.body.textContent).toContain("Medaris güncellendi");
    expect(button(document.body, "Yenile")).toBeTruthy();
    const kept = JSON.parse(
      window.localStorage.getItem("exam-unsaved:e1") ?? "[]"
    );
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ id: "", text: "Kalan soru" });
  });

  it("brings back the questions not saved before a reload, to try again", async () => {
    window.localStorage.setItem(
      "exam-unsaved:e1",
      JSON.stringify([
        {
          id: "",
          text: "Geri gelen soru",
          options: [
            { text: "Bir", correct: true },
            { text: "İki", correct: false },
          ],
          topicIds: ["t3"],
          answerMode: "SINGLE",
          scoring: null,
          points: null,
        },
      ])
    );
    const root = await render(wrap(<ExamEditor courseId="c1" draft={draft} />));
    await settle();
    expect(root.textContent).toContain("Geri gelen soru");
    expect(root.textContent).toContain("Kaydedilemedi");
    expect(button(root, "Yeniden dene")).toBeTruthy();
    window.localStorage.clear();
  });

  it("keeps a question being saved when the page is drawn again with a newer read", async () => {
    // The router draws the page again after a save that renewed the session:
    // the editor must not start over from the read, or what was typed is gone.
    actions.addExamQuestion.mockReturnValue(
      later({ success: true, data: { version: 2, question: { id: "q1" } } })
    );
    actions.saveExamQuestion.mockImplementation((_e, id, body) =>
      later(echo(id, body, 3))
    );
    const root = await render(wrap(<ExamEditor courseId="c1" draft={draft} />));
    await click(button(root, "Soru ekle"));
    await typeInto(textOf(root), "Uzun uzun yazılan soru");
    await click(button(root, "Kaydet"));
    held.shift()?.(); // the question is made
    await settle();
    // The page read again mid-save: the question exists, still empty.
    const read = {
      ...draft,
      version: 2,
      questions: [
        {
          id: "q1",
          number: 1,
          text: "",
          options: [],
          answerMode: "SINGLE",
          scoring: null,
          topicIds: [],
          ownPoints: null,
          points: "100.00",
          complete: false,
          lacks: ["text", "option", "correct", "topic"],
        },
      ],
    } as unknown as OnlineExamDraftResponse;
    await rerender(root, wrap(<ExamEditor courseId="c1" draft={read} />));
    expect(root.textContent).toContain("Uzun uzun yazılan soru");
    held.shift()?.(); // saved
    await settle();
    expect(root.textContent).toContain("Uzun uzun yazılan soru");
    expect(root.textContent).not.toContain("Kaydediliyor…");
  });

  it("takes a newer read when nothing of its own is on its way, keeping what was not saved", async () => {
    actions.addExamQuestion.mockResolvedValue({
      success: false,
      code: "SOMETHING",
    });
    const root = await render(wrap(<ExamEditor courseId="c1" draft={draft} />));
    await click(button(root, "Soru ekle"));
    await typeInto(textOf(root), "Kaydedilemeyen soru");
    await click(button(root, "Kaydet"));
    await settle();
    const newer = {
      ...draft,
      version: 7,
      questions: [
        {
          id: "q9",
          number: 1,
          text: "Başka sekmede yazılan soru",
          options: [
            { id: "o1", text: "Bir", correct: true },
            { id: "o2", text: "İki", correct: false },
          ],
          answerMode: "SINGLE",
          scoring: null,
          topicIds: ["t3"],
          ownPoints: null,
          points: "100.00",
          complete: true,
          lacks: [],
        },
      ],
    } as unknown as OnlineExamDraftResponse;
    await rerender(root, wrap(<ExamEditor courseId="c1" draft={newer} />));
    await settle();
    expect(root.textContent).toContain("Başka sekmede yazılan soru");
    expect(root.textContent).toContain("Kaydedilemeyen soru");
    expect(button(root, "Yeniden dene")).toBeTruthy();
  });

  it("shows a new topic with its number at once", async () => {
    actions.createCourseTopic.mockReturnValue(
      later({ success: true, data: { id: "t1", number: 1, name: "İcma" } })
    );
    const root = await render(wrap(<ExamEditor courseId="c1" draft={draft} />));
    const label = [...root.querySelectorAll("label")].find((l) =>
      l.textContent?.includes("Konu (bir ile üç kelime)")
    ) as HTMLLabelElement;
    const name = (document.getElementById(label.htmlFor) ??
      label.querySelector("input")) as HTMLInputElement;
    await typeInto(name, "İcma");
    await click(button(root, "Konu ekle"));
    expect(root.textContent).toContain("1. İcma");
    held.shift()?.();
    await settle();
    expect(root.textContent).toContain("1. İcma");
  });

  const echo = (
    id: string,
    body: {
      text: string;
      options: object[];
      topicIds: string[];
      answerMode?: string;
      scoring?: string | null;
    },
    version: number
  ) => ({
    success: true,
    data: {
      version,
      question: {
        id,
        number: 1,
        text: body.text,
        options: body.options.map((o, i) => ({ id: `o${i}`, ...o })),
        answerMode: body.answerMode ?? "SINGLE",
        scoring: body.scoring ?? null,
        topicIds: body.topicIds,
        ownPoints: null,
        points: "100.00",
        complete: false,
        lacks: [],
      },
    },
  });
  const textOf = (root: HTMLElement) =>
    root.querySelector(QUESTION_TEXT) as HTMLTextAreaElement;

  it("makes a question once when it is saved again before the server answers, and shows the latest text", async () => {
    let version = 1;
    actions.addExamQuestion.mockImplementation(() =>
      later({
        success: true,
        data: { version: ++version, question: { id: "q1" } },
      })
    );
    actions.saveExamQuestion.mockImplementation((_e, id, body) =>
      later(echo(id, body, ++version))
    );
    const root = await render(wrap(<ExamEditor courseId="c1" draft={draft} />));
    await click(button(root, "Soru ekle"));
    await typeInto(textOf(root), "Birinci yazış");
    await click(button(root, "Kaydet"));
    await click(button(root, "Düzenle"));
    await typeInto(textOf(root), "İkinci yazış");
    await click(button(root, "Kaydet"));

    held.shift()?.(); // the question is made, once
    await settle();
    held.shift()?.(); // the first save answers with the first text
    await settle();
    expect(root.textContent).toContain("İkinci yazış");
    expect(root.textContent).not.toContain("Birinci yazış");
    held.shift()?.(); // the second save, by the id the first made
    await settle();
    expect(actions.addExamQuestion).toHaveBeenCalledTimes(1);
    expect(actions.saveExamQuestion).toHaveBeenCalledTimes(2);
    expect(actions.saveExamQuestion.mock.calls.map((c) => c[1])).toEqual([
      "q1",
      "q1",
    ]);
    expect(root.textContent).toContain("İkinci yazış");
    expect(root.textContent).not.toContain("Kaydediliyor…");
  });

  it("deletes on the server a question taken off while it was being made", async () => {
    actions.addExamQuestion.mockReturnValue(
      later({ success: true, data: { version: 2, question: { id: "q1" } } })
    );
    actions.removeExamQuestion.mockResolvedValue({
      success: true,
      data: { version: 3 },
    });
    const root = await render(wrap(<ExamEditor courseId="c1" draft={draft} />));
    await click(button(root, "Soru ekle"));
    await typeInto(textOf(root), "Silinecek soru");
    await click(button(root, "Kaydet"));
    await click(button(root, "Sil"));
    await settle(80);
    const ask = document.querySelector("[role=alertdialog]") as HTMLElement;
    await click(button(ask, "Sil"));
    await settle(80);
    expect(root.textContent).not.toContain("Silinecek soru");
    held.shift()?.();
    await settle();
    expect(actions.saveExamQuestion).not.toHaveBeenCalled();
    expect(actions.removeExamQuestion).toHaveBeenCalledWith("e1", "q1", 2);
  });

  it("sends a topic added on the page by the id the server gave it", async () => {
    actions.createCourseTopic.mockReturnValue(
      later({ success: true, data: { id: "t7", number: 7, name: "İcma" } })
    );
    actions.addExamQuestion.mockResolvedValue({
      success: true,
      data: { version: 2, question: { id: "q1" } },
    });
    actions.saveExamQuestion.mockImplementation(async (_e, id, body) =>
      echo(id, body, 3)
    );
    const root = await render(wrap(<ExamEditor courseId="c1" draft={draft} />));
    const label = [...root.querySelectorAll("label")].find((l) =>
      l.textContent?.includes("Numara")
    ) as HTMLLabelElement;
    await typeInto(
      (document.getElementById(label.htmlFor) ??
        label.querySelector("input")) as HTMLInputElement,
      "7"
    );
    const nameLabel = [...root.querySelectorAll("label")].find((l) =>
      l.textContent?.includes("Konu (bir ile üç kelime)")
    ) as HTMLLabelElement;
    await typeInto(
      (document.getElementById(nameLabel.htmlFor) ??
        nameLabel.querySelector("input")) as HTMLInputElement,
      "İcma"
    );
    await click(button(root, "Konu ekle"));
    await click(button(root, "Soru ekle"));
    await typeInto(textOf(root), "Soru");
    await click(topicChip(root, "7. İcma"));
    await click(button(root, "Kaydet"));
    held.shift()?.(); // the topic is made
    await settle();
    expect(actions.saveExamQuestion).toHaveBeenCalledWith(
      "e1",
      "q1",
      expect.objectContaining({ topicIds: ["t7"] })
    );
  });

  /**
   * The kit's controls by what they say: a check box or a radio is labelled by
   * the text beside it. A check box is pressed by its label: happy-dom does not
   * forward a click on the box to its input, as the browser does.
   */
  const control = (
    root: HTMLElement,
    role: "checkbox" | "radio",
    label: string,
    nth = 0
  ) => {
    const found = [...root.querySelectorAll(`[role=${role}]`)].filter((c) => {
      const id = c.getAttribute("aria-labelledby");
      return id !== null && document.getElementById(id)?.textContent === label;
    })[nth] as HTMLElement;
    return role === "checkbox"
      ? (found.closest("label") as HTMLElement)
      : found;
  };
  const field = (root: HTMLElement, label: string) => {
    const l = [...root.querySelectorAll("label")].find((it) =>
      it.textContent?.startsWith(label)
    ) as HTMLLabelElement;
    return (document.getElementById(l.htmlFor) ??
      l.querySelector("input")) as HTMLInputElement;
  };
  const option = (root: HTMLElement, n: number) =>
    [...root.querySelectorAll("input")].find(
      (i) => i.getAttribute("aria-label") === `${n}. şık`
    ) as HTMLInputElement;

  it("asks how a question with two correct options is answered and scored, and sends it", async () => {
    actions.addExamQuestion.mockResolvedValue({
      success: true,
      data: { version: 2, question: { id: "q1" } },
    });
    actions.saveExamQuestion.mockImplementation(async (_e, id, body) =>
      echo(id, body, 3)
    );
    const root = await render(wrap(<ExamEditor courseId="c1" draft={draft} />));
    await click(button(root, "Soru ekle"));
    await typeInto(textOf(root), "Hangileri kıyasın rüknüdür?");
    await typeInto(option(root, 1), "Asıl");
    await typeInto(option(root, 2), "Fer");
    await typeInto(option(root, 3), "Rivayet");
    // One correct option: radio buttons, nothing asked.
    await click(control(root, "checkbox", "Doğru", 0));
    expect(root.textContent).not.toContain("Cevaplama");
    await click(control(root, "checkbox", "Doğru", 1));
    expect(root.textContent).toContain("Cevaplama");
    expect(root.textContent).not.toContain("Puanlama");
    await click(control(root, "radio", "Çoklu seçim"));
    await click(control(root, "radio", "Kesirli, yanlış düşer"));
    await click(topicChip(root, "3. Kıyas"));
    await click(button(root, "Kaydet"));
    await settle();
    expect(actions.saveExamQuestion).toHaveBeenCalledWith(
      "e1",
      "q1",
      expect.objectContaining({
        answerMode: "MULTIPLE",
        scoring: "IN_SHARES",
        version: 2,
      })
    );
    expect(root.textContent).toContain("Çoklu seçim · Kesirli, yanlış düşer");
    // No own points typed: no points write.
    expect(actions.setExamQuestionPoints).not.toHaveBeenCalled();
  });

  /** A paste of `text`, as the browser fires it, with what the clipboard holds. */
  const paste = async (element: HTMLElement, text: string) => {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { getData: () => text },
    });
    await act(async () => {
      element.dispatchEvent(event);
    });
    return event;
  };
  const options = (root: HTMLElement) =>
    [...root.querySelectorAll("input")].filter((i) =>
      /^\d+\. şık$/.test(i.getAttribute("aria-label") ?? "")
    );

  it("puts each option's letter and Doğru before it, and says how to type them quickly", async () => {
    actions.addExamQuestion.mockResolvedValue({
      success: true,
      data: { version: 2, question: { id: "q1" } },
    });
    const root = await render(wrap(<ExamEditor courseId="c1" draft={draft} />));
    await click(button(root, "Soru ekle"));
    const rows = [...root.querySelectorAll("form fieldset li")];
    expect(rows).toHaveLength(5);
    const first = rows[0] as HTMLElement;
    expect(first.textContent).toBe("ADoğru");
    // The letter, the box, then the field: the box is beside its option.
    const box = first.querySelector("[role=checkbox]") as HTMLElement;
    const input = first.querySelector("input[aria-label='1. şık']");
    expect(
      box.compareDocumentPosition(input as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    // Each "Doğru" is told apart by its option's letter.
    const letter = document.getElementById(
      box.getAttribute("aria-describedby") ?? ""
    );
    expect(letter?.textContent).toBe("A");
    expect(rows[1]?.textContent).toBe("BDoğru");
    const fieldset = root.querySelector("form fieldset") as HTMLElement;
    expect(
      document.getElementById(fieldset.getAttribute("aria-describedby") ?? "")
        ?.textContent
    ).toContain("Enter ile sonraki şıkka geçin");
  });

  it("goes on to the next option with Enter, and adds one after the last", async () => {
    actions.addExamQuestion.mockResolvedValue({
      success: true,
      data: { version: 2, question: { id: "q1" } },
    });
    const root = await render(wrap(<ExamEditor courseId="c1" draft={draft} />));
    await click(button(root, "Soru ekle"));
    await typeInto(option(root, 1), "Asıl");
    await key(option(root, 1), "Enter");
    expect(document.activeElement).toBe(option(root, 2));
    // Enter does not send the form.
    expect(actions.saveExamQuestion).not.toHaveBeenCalled();
    await key(option(root, 5), "Enter");
    expect(options(root)).toHaveLength(6);
    expect(document.activeElement).toBe(option(root, 6));
  });

  it("spreads a pasted list over the options, a line each, marks taken off", async () => {
    actions.addExamQuestion.mockResolvedValue({
      success: true,
      data: { version: 2, question: { id: "q1" } },
    });
    actions.saveExamQuestion.mockImplementation(async (_e, id, body) =>
      echo(id, body, 3)
    );
    const root = await render(wrap(<ExamEditor courseId="c1" draft={draft} />));
    await click(button(root, "Soru ekle"));
    await typeInto(textOf(root), "Kıyasın rükünleri hangileridir?");
    const event = await paste(
      option(root, 1),
      "A) Asıl\nB) Fer\n\nC) Illet\nD) Hüküm\nE) Rivayet\nF) Hadis"
    );
    expect(event.defaultPrevented).toBe(true);
    expect(options(root).map((i) => i.value)).toEqual([
      "Asıl",
      "Fer",
      "Illet",
      "Hüküm",
      "Rivayet",
      "Hadis",
    ]);
    expect(document.activeElement).toBe(option(root, 6));
    await click(control(root, "checkbox", "Doğru", 0));
    await click(topicChip(root, "3. Kıyas"));
    await click(button(root, "Kaydet"));
    await settle();
    expect(actions.saveExamQuestion).toHaveBeenCalledWith(
      "e1",
      "q1",
      expect.objectContaining({
        options: [
          { text: "Asıl", correct: true },
          { text: "Fer", correct: false },
          { text: "Illet", correct: false },
          { text: "Hüküm", correct: false },
          { text: "Rivayet", correct: false },
          { text: "Hadis", correct: false },
        ],
      })
    );
  });

  it("lets a one-line paste, or one into a typed option, through as it is", async () => {
    actions.addExamQuestion.mockResolvedValue({
      success: true,
      data: { version: 2, question: { id: "q1" } },
    });
    const root = await render(wrap(<ExamEditor courseId="c1" draft={draft} />));
    await click(button(root, "Soru ekle"));
    const event = await paste(option(root, 2), "Fer");
    expect(event.defaultPrevented).toBe(false);
    // Into an option that holds text, even a list goes in at the caret.
    await typeInto(option(root, 1), "Asıl");
    const into = await paste(option(root, 1), "Fer\nİllet");
    expect(into.defaultPrevented).toBe(false);
    expect(option(root, 2).value).toBe("");
  });

  it("offers check boxes where any correct one is enough, and sends it", async () => {
    actions.addExamQuestion.mockResolvedValue({
      success: true,
      data: { version: 2, question: { id: "q1" } },
    });
    actions.saveExamQuestion.mockImplementation(async (_e, id, body) =>
      echo(id, body, 3)
    );
    const root = await render(wrap(<ExamEditor courseId="c1" draft={draft} />));
    await click(button(root, "Soru ekle"));
    await typeInto(textOf(root), "Hangileri kıyasın rüknüdür?");
    await typeInto(option(root, 1), "Asıl");
    await typeInto(option(root, 2), "Fer");
    await typeInto(option(root, 3), "Rivayet");
    await click(control(root, "checkbox", "Doğru", 0));
    await click(control(root, "checkbox", "Doğru", 1));
    await click(control(root, "radio", "Çoklu seçim"));
    await click(control(root, "radio", "Doğrulardan biri yeterli"));
    await click(topicChip(root, "3. Kıyas"));
    await click(button(root, "Kaydet"));
    await settle();
    expect(actions.saveExamQuestion).toHaveBeenCalledWith(
      "e1",
      "q1",
      expect.objectContaining({
        answerMode: "MULTIPLE",
        scoring: "ANY_CORRECT",
      })
    );
    expect(root.textContent).toContain(
      "Çoklu seçim · Doğrulardan biri yeterli"
    );
  });

  it("shows own points at once, and sets them after the save with the version the save gave", async () => {
    actions.addExamQuestion.mockReturnValue(
      later({ success: true, data: { version: 2, question: { id: "q1" } } })
    );
    actions.saveExamQuestion.mockImplementation((_e, id, body) =>
      later(echo(id, body, 3))
    );
    // Held from when it is called, so the answers come in the order of the calls.
    actions.setExamQuestionPoints.mockImplementation(() =>
      later({
        success: true,
        data: {
          questions: [{ questionId: "q1", points: "10.00", own: true }],
          total: "10.00",
          version: 4,
        },
      })
    );
    const root = await render(wrap(<ExamEditor courseId="c1" draft={draft} />));
    await click(button(root, "Soru ekle"));
    await typeInto(textOf(root), "Soru");
    await typeInto(field(root, "Kendi puanı"), "10");
    await click(button(root, "Kaydet"));
    expect(root.textContent).toContain("10 puan · kendi puanı");
    held.shift()?.(); // made
    await settle();
    held.shift()?.(); // saved
    await settle();
    expect(actions.setExamQuestionPoints).toHaveBeenCalledWith(
      "e1",
      "q1",
      3,
      "10.00"
    );
    expect(root.textContent).toContain("Kaydediliyor…");
    held.shift()?.(); // points set
    await settle();
    expect(root.textContent).toContain("10 puan · kendi puanı");
    expect(root.textContent).not.toContain("Kaydediliyor…");
  });

  it("puts a question back into the equal share when its own points are cleared", async () => {
    const withOwn = {
      ...draft,
      questions: [
        {
          id: "q1",
          number: 1,
          text: "Soru",
          options: [
            { id: "o1", text: "Bir", correct: true },
            { id: "o2", text: "İki", correct: false },
          ],
          answerMode: "SINGLE",
          scoring: null,
          topicIds: ["t3"],
          ownPoints: "5.00",
          points: "5.00",
          complete: true,
          lacks: [],
        },
      ],
    } as unknown as OnlineExamDraftResponse;
    actions.saveExamQuestion.mockImplementation(async (_e, id, body) => {
      const saved = echo(id, body, 2);
      saved.data.question.ownPoints = "5.00" as unknown as null;
      return saved;
    });
    actions.setExamQuestionPoints.mockResolvedValue({
      success: true,
      data: {
        questions: [{ questionId: "q1", points: "100.00", own: false }],
        total: "100.00",
        version: 3,
      },
    });
    const root = await render(
      wrap(<ExamEditor courseId="c1" draft={withOwn} />)
    );
    await click(button(root, "Düzenle"));
    expect(field(root, "Kendi puanı").value).toBe("5");
    await typeInto(field(root, "Kendi puanı"), "");
    await click(button(root, "Kaydet"));
    await settle();
    await settle();
    expect(actions.setExamQuestionPoints).toHaveBeenCalledWith(
      "e1",
      "q1",
      2,
      null
    );
    expect(root.textContent).not.toContain("Kaydedilemedi");
    expect(root.textContent).toContain("100 puan · eşit pay");
  });

  it("keeps the typed points when they do not fit, and says how many are left", async () => {
    const two = {
      ...draft,
      questions: [
        {
          ...echo("q1", { text: "Birinci", options: [], topicIds: [] }, 1).data
            .question,
          ownPoints: "50.00",
          points: "50.00",
        },
        {
          ...echo("q2", { text: "İkinci", options: [], topicIds: [] }, 1).data
            .question,
          number: 2,
          points: "50.00",
        },
      ],
    } as unknown as OnlineExamDraftResponse;
    actions.saveExamQuestion.mockImplementation(async (_e, id, body) => ({
      ...echo(id, body, 2),
      data: {
        ...echo(id, body, 2).data,
        question: { ...echo(id, body, 2).data.question, number: 2 },
      },
    }));
    actions.setExamQuestionPoints.mockResolvedValue({
      success: false,
      code: "POINTS_OVER_TOTAL",
      pointsLeft: "50.00",
    });
    const root = await render(wrap(<ExamEditor courseId="c1" draft={two} />));
    expect(root.textContent).toContain("50 puan · kendi puanı");
    expect(root.textContent).toContain("50 puan · eşit pay");
    await click(
      [...root.querySelectorAll("button")].filter(
        (b) => b.textContent === "Düzenle"
      )[1] as HTMLButtonElement
    );
    await typeInto(field(root, "Kendi puanı"), "60");
    await click(button(root, "Kaydet"));
    await settle(80);
    expect(actions.setExamQuestionPoints).toHaveBeenCalledWith(
      "e1",
      "q2",
      2,
      "60.00"
    );
    expect(document.body.textContent).toContain(
      "verilebilecek en çok 50 puan kaldı"
    );
    expect(root.textContent).toContain("Kaydedilemedi");
    // The shares stay as the server has them; the typed points wait in the form.
    expect(root.textContent).toContain("50 puan · eşit pay");
    await click(
      [...root.querySelectorAll("button")].filter(
        (b) => b.textContent === "Düzenle"
      )[1] as HTMLButtonElement
    );
    expect(field(root, "Kendi puanı").value).toBe("60");
  });

  const removeChip = async (label: string) => {
    await click(
      root().querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement
    );
    await settle(80);
    await click(
      button(document.querySelector("[role=alertdialog]") as HTMLElement, "Sil")
    );
    await settle(80);
  };
  const root = () => document.body;
  const chips = () =>
    [
      ...(document
        .getElementById("topics-title")
        ?.closest("section")
        ?.querySelectorAll("ul li") ?? []),
    ].map((li) => li.textContent?.trim());

  it("takes a topic off at once, and puts it back naming the questions that carry it", async () => {
    actions.removeCourseTopic.mockImplementation(() =>
      later({
        success: false,
        code: "TOPIC_IN_USE",
        questions: [{ examId: "e2", examTitle: "Ara sınav", number: 2 }],
      })
    );
    await render(wrap(<ExamEditor courseId="c1" draft={draft} />));
    expect(chips()).toEqual(["3. Kıyas"]);
    await removeChip("3. Kıyas konusunu sil");
    expect(chips()).toEqual([]);
    expect(actions.removeCourseTopic).toHaveBeenCalledWith("c1", "t3");
    held.shift()?.();
    await settle(80);
    expect(chips()).toEqual(["3. Kıyas"]);
    expect(document.body.textContent).toContain(
      "şu sorular onu taşıyor: Ara sınav, 2. soru"
    );
  });

  it("deletes a new topic taken off while it was being made, by the id the server gave", async () => {
    actions.createCourseTopic.mockImplementation(() =>
      later({ success: true, data: { id: "t1", number: 1, name: "İcma" } })
    );
    actions.removeCourseTopic.mockResolvedValue({
      success: true,
      data: { exams: [] },
    });
    const page = await render(wrap(<ExamEditor courseId="c1" draft={draft} />));
    await typeInto(field(page, "Konu (bir ile üç kelime)"), "İcma");
    await click(button(page, "Konu ekle"));
    expect(chips()).toEqual(["1. İcma", "3. Kıyas"]);
    await removeChip("1. İcma konusunu sil");
    expect(chips()).toEqual(["3. Kıyas"]);
    held.shift()?.(); // the topic is made
    await settle(80);
    expect(actions.removeCourseTopic).toHaveBeenCalledWith("c1", "t1");
    expect(chips()).toEqual(["3. Kıyas"]);
  });

  it("deletes a new topic whose create answered while its confirmation was open", async () => {
    actions.createCourseTopic.mockImplementation(() =>
      later({ success: true, data: { id: "t1", number: 1, name: "İcma" } })
    );
    actions.removeCourseTopic.mockResolvedValue({
      success: true,
      data: { exams: [] },
    });
    const page = await render(wrap(<ExamEditor courseId="c1" draft={draft} />));
    await typeInto(field(page, "Konu (bir ile üç kelime)"), "İcma");
    await click(button(page, "Konu ekle"));
    // The confirmation opens on the topic while it still has its local id.
    await click(
      root().querySelector(
        'button[aria-label="1. İcma konusunu sil"]'
      ) as HTMLButtonElement
    );
    await settle(80);
    held.shift()?.(); // the create answers, with the server's id
    await settle(80);
    await click(
      button(document.querySelector("[role=alertdialog]") as HTMLElement, "Sil")
    );
    await settle(80);
    expect(chips()).toEqual(["3. Kıyas"]);
    expect(actions.removeCourseTopic).toHaveBeenCalledWith("c1", "t1");
  });

  it("takes the exam's version from a topic removal's answer", async () => {
    const picked = {
      ...draft,
      courseTopics: [
        { id: "t3", number: 3, name: "Kıyas", picked: true, questionCount: 0 },
      ],
      topicIds: ["t3"],
    } as unknown as OnlineExamDraftResponse;
    actions.removeCourseTopic.mockResolvedValue({
      success: true,
      data: { exams: [{ id: "e1", version: 7 }] },
    });
    actions.saveExamSettings.mockResolvedValue({
      success: true,
      data: { version: 8 },
    });
    await render(wrap(<ExamEditor courseId="c1" draft={picked} />));
    await removeChip("3. Kıyas konusunu sil");
    await typeInto(settingsField("Süre (dakika)"), "30");
    await click(button(root(), "Ayarları kaydet"));
    await settle(80);
    expect(actions.saveExamSettings).toHaveBeenCalledWith(
      "e1",
      expect.objectContaining({ durationMinutes: 30, version: 7 })
    );
  });

  const settingsField = (label: string) => {
    const field = [...document.querySelectorAll(".mds-field")].find(
      (f) => f.querySelector(".mds-label")?.textContent === label
    ) as HTMLElement;
    return field.querySelector("input, textarea") as
      | HTMLInputElement
      | HTMLTextAreaElement;
  };

  it("queues the settings after a question save, with the version that save gave", async () => {
    actions.addExamQuestion.mockReturnValue(
      later({ success: true, data: { version: 2, question: { id: "q1" } } })
    );
    actions.saveExamQuestion.mockImplementation((_e, id, body) =>
      later({
        success: true,
        data: {
          version: 3,
          question: {
            id,
            number: 1,
            text: body.text,
            options: [],
            answerMode: "SINGLE",
            scoring: null,
            topicIds: [],
            ownPoints: null,
            points: "100.00",
            complete: false,
            lacks: [],
          },
        },
      })
    );
    // Lazy: its answer is held only once the call is made, after the question's.
    actions.saveExamSettings.mockImplementation(() =>
      later({ success: true, data: { version: 4 } })
    );
    const root = await render(wrap(<ExamEditor courseId="c1" draft={draft} />));
    await click(button(root, "Soru ekle"));
    await typeInto(
      root.querySelector(QUESTION_TEXT) as HTMLTextAreaElement,
      "Bir soru"
    );
    await click(button(root, "Kaydet"));
    await typeInto(settingsField("Süre (dakika)"), "45");
    await typeInto(settingsField("Talimatlar"), "Hesap makinesi yok.");
    await click(button(root, "Ayarları kaydet"));
    // Shown at once, saving, with nothing disabled.
    expect(root.textContent).toContain("Kaydediliyor…");
    expect(button(root, "Soru ekle").disabled).toBe(false);
    expect(actions.saveExamSettings).not.toHaveBeenCalled();

    held.shift()?.(); // the question is made
    await settle();
    held.shift()?.(); // and saved
    await settle();
    expect(actions.saveExamSettings).toHaveBeenCalledWith("e1", {
      title: "Ara sınav",
      durationMinutes: 45,
      instructions: "Hesap makinesi yok.",
      version: 3,
    });
    held.shift()?.(); // the settings answer
    await settle();
    expect(root.textContent).not.toContain("Kaydediliyor…");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("keeps the typed length when the settings save fails, and offers it again", async () => {
    actions.saveExamSettings.mockResolvedValueOnce({
      success: false,
      code: "SOMETHING",
    });
    const root = await render(wrap(<ExamEditor courseId="c1" draft={draft} />));
    await typeInto(settingsField("Süre (dakika)"), "90");
    await click(button(root, "Ayarları kaydet"));
    await settle();
    expect((settingsField("Süre (dakika)") as HTMLInputElement).value).toBe(
      "90"
    );
    expect(root.textContent).toContain("Kaydedilemedi");
    actions.saveExamSettings.mockResolvedValueOnce({
      success: true,
      data: { version: 2 },
    });
    await click(button(root, "Yeniden dene"));
    await settle();
    expect(actions.saveExamSettings).toHaveBeenLastCalledWith(
      "e1",
      expect.objectContaining({ durationMinutes: 90, version: 1 })
    );
    expect(root.textContent).not.toContain("Kaydedilemedi");
  });

  it("does not send a length of zero, and says why", async () => {
    const root = await render(wrap(<ExamEditor courseId="c1" draft={draft} />));
    await typeInto(settingsField("Süre (dakika)"), "0");
    await click(button(root, "Ayarları kaydet"));
    await settle();
    expect(actions.saveExamSettings).not.toHaveBeenCalled();
    expect(root.textContent).toContain(
      "Süre sıfırdan büyük bir tam sayı olmalı."
    );
  });

  it("starts a new exam's length blank, and sends a cleared length as none", async () => {
    let version = 1;
    actions.saveExamSettings.mockImplementation(async () => ({
      success: true,
      data: { version: ++version },
    }));
    const fresh = {
      ...draft,
      durationMinutes: null,
    } as unknown as OnlineExamDraftResponse;
    const root = await render(wrap(<ExamEditor courseId="c1" draft={fresh} />));
    expect((settingsField("Süre (dakika)") as HTMLInputElement).value).toBe("");
    await typeInto(settingsField("Süre (dakika)"), "40");
    await click(button(root, "Ayarları kaydet"));
    await settle();
    expect(actions.saveExamSettings).toHaveBeenLastCalledWith(
      "e1",
      expect.objectContaining({ durationMinutes: 40 })
    );
    await typeInto(settingsField("Süre (dakika)"), "");
    await click(button(root, "Ayarları kaydet"));
    await settle();
    expect(actions.saveExamSettings).toHaveBeenLastCalledWith(
      "e1",
      expect.objectContaining({ durationMinutes: null })
    );
    expect(root.textContent).not.toContain(
      "Süre sıfırdan büyük bir tam sayı olmalı."
    );
  });

  const saved = (over: object = {}) =>
    ({
      ...draft,
      questions: [
        {
          id: "q1",
          number: 1,
          text: "Kıyasın rükünleri kaç tanedir?",
          options: [
            { id: "o1", text: "Üç", correct: false },
            { id: "o2", text: "Dört", correct: true },
          ],
          answerMode: "SINGLE",
          scoring: null,
          topicIds: ["t3"],
          ownPoints: null,
          points: "100.00",
          complete: true,
          lacks: [],
          ...over,
        },
      ],
    }) as unknown as OnlineExamDraftResponse;
  /** A key pressed with its modifiers, as the browser fires it. */
  const press = async (element: Element, init: KeyboardEventInit) => {
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ...init,
    });
    await act(async () => {
      element.dispatchEvent(event);
    });
    return event;
  };
  const forms = (root: HTMLElement) => [
    ...root.querySelectorAll<HTMLFormElement>('form[aria-label$=". soru"]'),
  ];
  const checkbox = (root: HTMLElement, n: number) =>
    [...root.querySelectorAll("form fieldset li")][n - 1]?.querySelector(
      "[role=checkbox]"
    ) as HTMLElement;

  it("draws a saved question as one row: its text, options, correct letter, topic and state (MDRS-248)", async () => {
    const root = await render(
      wrap(<ExamEditor courseId="c1" draft={saved()} />)
    );
    const row = root.querySelector(
      'article[aria-label="1. soru"]'
    ) as HTMLElement;
    expect(row.textContent).toContain("Kıyasın rükünleri kaç tanedir?");
    expect(row.textContent).toContain("2 şık · Doğru: B");
    expect(row.textContent).toContain("3. Kıyas");
    expect(row.textContent).toContain("Tamam");
    // The options are in the form, not in the row.
    expect(row.textContent).not.toContain("Üç");
    expect(forms(root)).toHaveLength(0);
    // A click on its text opens it in place.
    await click(row.querySelector("button[tabindex='-1']") as HTMLElement);
    expect(forms(root)).toHaveLength(1);
    expect(option(root, 2).value).toBe("Dört");
  });

  it("opens the next question's form after saving a new one, the caret in Soru (MDRS-248)", async () => {
    actions.addExamQuestion.mockResolvedValue({
      success: true,
      data: { version: 2, question: { id: "q2" } },
    });
    actions.saveExamQuestion.mockImplementation(async (_e, id, body) =>
      echo(id, body, 3)
    );
    const root = await render(
      wrap(<ExamEditor courseId="c1" draft={saved()} />)
    );
    await click(button(root, "Soru ekle"));
    expect(document.activeElement).toBe(textOf(root));
    await typeInto(textOf(root), "İcmanın rüknü nedir?");
    await typeInto(option(root, 1), "Ittifak");
    await click(button(root, "Kaydet"));
    await settle();
    expect(actions.saveExamQuestion).toHaveBeenCalledTimes(1);
    // The saved one is a row, and a blank form for the third waits under it.
    const open = forms(root);
    expect(open).toHaveLength(1);
    expect(open[0]?.getAttribute("aria-label")).toBe("3. soru");
    expect(document.activeElement).toBe(textOf(root));
    expect(textOf(root).value).toBe("");
    // The blank form is not counted, and "Soru ekle" takes the caret back to it.
    expect(root.textContent).toContain("Sorular (2)");
    await click(button(root, "Soru ekle"));
    expect(forms(root)).toHaveLength(1);
  });

  it("closes an edited question on save, with no new form (MDRS-248)", async () => {
    actions.saveExamQuestion.mockImplementation(async (_e, id, body) =>
      echo(id, body, 3)
    );
    const root = await render(
      wrap(<ExamEditor courseId="c1" draft={saved()} />)
    );
    await click(button(root, "Düzenle"));
    await typeInto(textOf(root), "Kıyasın kaç rüknü vardır?");
    await click(button(root, "Kaydet"));
    await settle();
    expect(actions.saveExamQuestion).toHaveBeenCalledTimes(1);
    expect(forms(root)).toHaveLength(0);
  });

  it("saves with Cmd+Enter or Ctrl+Enter from any field, and says so under the form (MDRS-248)", async () => {
    actions.addExamQuestion.mockResolvedValue({
      success: true,
      data: { version: 2, question: { id: "q1" } },
    });
    actions.saveExamQuestion.mockImplementation(async (_e, id, body) =>
      echo(id, body, 3)
    );
    const root = await render(wrap(<ExamEditor courseId="c1" draft={draft} />));
    await click(button(root, "Soru ekle"));
    expect(forms(root)[0]?.textContent).toContain("⌘ + Enter");
    await typeInto(textOf(root), "Kıyasın rükünleri kaç tanedir?");
    await typeInto(option(root, 1), "Dört");
    // Cmd+Enter in an option saves; it does not go on to the next option.
    const sent = await press(option(root, 1), { key: "Enter", metaKey: true });
    expect(sent.defaultPrevented).toBe(true);
    await settle();
    expect(actions.saveExamQuestion).toHaveBeenCalledTimes(1);
    await typeInto(textOf(root), "İkinci soru");
    await press(textOf(root), { key: "Enter", ctrlKey: true });
    await settle();
    expect(actions.saveExamQuestion).toHaveBeenCalledTimes(2);
  });

  it("tabs Soru → A → B with one stop per option, and marks Doğru with Alt+D (MDRS-248)", async () => {
    const root = await render(wrap(<ExamEditor courseId="c1" draft={draft} />));
    await click(button(root, "Soru ekle"));
    // The form's Tab stops up to "Şık ekle": the text, then the options alone.
    const form = forms(root)[0] as HTMLFormElement;
    const stops = [
      ...form.querySelectorAll<HTMLElement>(
        "textarea, input:not([type=hidden]), button, [role=checkbox]"
      ),
    ].filter((el) => el.tabIndex >= 0);
    const firstStops = stops.slice(0, 6);
    expect(firstStops[0]).toBe(textOf(root));
    expect(firstStops.slice(1)).toEqual(
      [1, 2, 3, 4, 5].map((n) => option(root, n))
    );
    // Each box is still a labelled check box, out of the Tab order only.
    const box = checkbox(root, 2);
    expect(box.getAttribute("tabindex")).toBe("-1");
    expect(box.getAttribute("aria-checked")).toBe("false");
    expect(option(root, 2).getAttribute("aria-keyshortcuts")).toBe("Alt+D");
    // Option+D on a Mac types "∂": the key is read by its place.
    const marked = await press(option(root, 2), {
      key: "∂",
      code: "KeyD",
      altKey: true,
    });
    expect(marked.defaultPrevented).toBe(true);
    expect(checkbox(root, 2).getAttribute("aria-checked")).toBe("true");
    await press(option(root, 2), { key: "d", code: "KeyD", altKey: true });
    expect(checkbox(root, 2).getAttribute("aria-checked")).toBe("false");
    // A click on the box still marks it.
    await click(control(root, "checkbox", "Doğru", 0));
    expect(checkbox(root, 1).getAttribute("aria-checked")).toBe("true");
  });

  it("picks topics as chips, makes one with + Konu, and Enter there never sends the question (MDRS-248)", async () => {
    actions.createCourseTopic.mockReturnValue(
      later({ success: true, data: { id: "t4", number: 4, name: "İcma" } })
    );
    actions.addExamQuestion.mockResolvedValue({
      success: true,
      data: { version: 2, question: { id: "q1" } },
    });
    actions.saveExamQuestion.mockImplementation(async (_e, id, body) =>
      echo(id, body, 3)
    );
    const root = await render(wrap(<ExamEditor courseId="c1" draft={draft} />));
    await click(button(root, "Soru ekle"));
    expect(topicChip(root, "3. Kıyas").getAttribute("aria-pressed")).toBe(
      "false"
    );
    await click(topicChip(root, "3. Kıyas"));
    expect(topicChip(root, "3. Kıyas").getAttribute("aria-pressed")).toBe(
      "true"
    );
    await click(button(root, "+ Konu"));
    const name = root.querySelector(
      "input[aria-label='Yeni konu']"
    ) as HTMLInputElement;
    expect(document.activeElement).toBe(name);
    await typeInto(name, "İcma");
    await key(name, "Enter");
    expect(actions.saveExamQuestion).not.toHaveBeenCalled();
    // Shown and picked at once, made in the background.
    expect(topicChip(root, "1. İcma").getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(actions.createCourseTopic).toHaveBeenCalledWith(
      "c1",
      "İcma",
      undefined
    );
    await typeInto(textOf(root), "İcmanın rüknü nedir?");
    await click(button(root, "Kaydet"));
    held.shift()?.(); // the topic is made
    await settle();
    expect(actions.saveExamQuestion).toHaveBeenCalledWith(
      "e1",
      "q1",
      expect.objectContaining({ topicIds: ["t3", "t4"] })
    );
  });

  it("asks a topic in an exam, and not in a çalışma seti (MDRS-248)", async () => {
    const bare = saved({ topicIds: [], complete: false, lacks: ["topic"] });
    const exam = await render(wrap(<ExamEditor courseId="c1" draft={bare} />));
    expect(exam.textContent).toContain("1. sorunun konusu yok.");
    expect(exam.textContent).toContain("Eksik");
    await cleanup();
    const set = await render(
      wrap(
        <ExamEditor
          courseId="c1"
          kind="PRACTICE"
          draft={saved({ topicIds: [], complete: true, lacks: [] })}
        />
      )
    );
    expect(set.textContent).not.toContain("konusu yok");
    expect(set.textContent).toContain("Tamam");
    await click(button(set, "Düzenle"));
    expect(set.textContent).toContain("Konular (isteğe bağlı)");
  });

  it("leaves an empty option out on save with Doğru on its own option, and says so first (MDRS-248)", async () => {
    actions.addExamQuestion.mockResolvedValue({
      success: true,
      data: { version: 2, question: { id: "q1" } },
    });
    actions.saveExamQuestion.mockImplementation(async (_e, id, body) =>
      echo(id, body, 3)
    );
    const root = await render(wrap(<ExamEditor courseId="c1" draft={draft} />));
    await click(button(root, "Soru ekle"));
    await typeInto(textOf(root), "Kıyasın rükünleri kaç tanedir?");
    await typeInto(option(root, 1), "Üç");
    await typeInto(option(root, 3), "Dört");
    await click(control(root, "checkbox", "Doğru", 2));
    expect(root.textContent).toContain("Boş şıklar kaydedince kaldırılır");
    await click(topicChip(root, "3. Kıyas"));
    await click(button(root, "Kaydet"));
    await settle();
    // "Dört" was C and is B now, still the correct one.
    expect(actions.saveExamQuestion).toHaveBeenCalledWith(
      "e1",
      "q1",
      expect.objectContaining({
        options: [
          { text: "Üç", correct: false },
          { text: "Dört", correct: true },
        ],
      })
    );
    expect(root.textContent).toContain("2 şık · Doğru: B");
  });

  it("does not save an empty option marked Doğru, and names it (MDRS-248)", async () => {
    const root = await render(wrap(<ExamEditor courseId="c1" draft={draft} />));
    await click(button(root, "Soru ekle"));
    await typeInto(textOf(root), "Soru");
    await typeInto(option(root, 1), "Üç");
    await click(control(root, "checkbox", "Doğru", 1));
    expect(root.querySelector("[role=alert]")?.textContent).toBe(
      "B şıkkı boş ama doğru işaretli. Metnini yazın ya da işareti kaldırın."
    );
    expect(button(root, "Kaydet").disabled).toBe(true);
    await press(textOf(root), { key: "Enter", metaKey: true });
    await settle();
    expect(actions.addExamQuestion).not.toHaveBeenCalled();
    expect(actions.saveExamQuestion).not.toHaveBeenCalled();
  });

  it("folds Ayarlar and Konular to a summary line when they are filled in (MDRS-248)", async () => {
    await render(wrap(<ExamEditor courseId="c1" draft={saved()} />));
    // A heading that holds the button opening it: the outline still finds it.
    const fold = (id: string) =>
      document.querySelector(`h2#${id} > button`) as HTMLButtonElement;
    const open = (id: string) =>
      fold(id).getAttribute("aria-expanded") === "true";
    const line = (id: string) =>
      document.getElementById(id)?.closest("section")?.firstElementChild
        ?.textContent;
    expect(open("settings-title")).toBe(false);
    expect(line("settings-title")).toContain("Ara sınav · 60 dk");
    expect(open("topics-title")).toBe(false);
    expect(line("topics-title")).toContain("1 konu");
    // Folded, the fields stay drawn and hidden; the button opens them.
    const panel = document.getElementById(
      fold("topics-title").getAttribute("aria-controls") ?? ""
    ) as HTMLElement;
    expect(panel.hidden).toBe(true);
    await click(fold("topics-title"));
    expect(open("topics-title")).toBe(true);
    expect(panel.hidden).toBe(false);
    await cleanup();
    // A new exam's length and a course with no topic yet want filling in: open.
    await render(
      wrap(
        <ExamEditor
          courseId="c1"
          draft={
            {
              ...draft,
              durationMinutes: null,
              courseTopics: [],
            } as unknown as OnlineExamDraftResponse
          }
        />
      )
    );
    expect(open("settings-title")).toBe(true);
    expect(open("topics-title")).toBe(true);
  });

  it("draws Arabic by the standard: a row's text, a mixed text's Arabic run, and the form's fields (MDRS-248)", async () => {
    const arabic = saved({
      text: "مَا مَعْنَى «الرَّحْمٰنِ»؟",
      options: [
        { id: "o1", text: "كَثِيرُ الرَّحْمَةِ", correct: true },
        { id: "o2", text: "Çok merhametli olan", correct: false },
      ],
    });
    const root = await render(
      wrap(<ExamEditor courseId="c1" draft={arabic} />)
    );
    const row = root.querySelector(
      'article[aria-label="1. soru"]'
    ) as HTMLElement;
    const text = row.querySelector("[lang=ar]") as HTMLElement;
    expect(text.getAttribute("dir")).toBe("rtl");
    expect(text.textContent).toBe("مَا مَعْنَى «الرَّحْمٰنِ»؟");
    expect(text.style.fontFamily).toBe("var(--font-arabic)");
    await click(button(root, "Düzenle"));
    expect(textOf(root).getAttribute("lang")).toBe("ar");
    expect(option(root, 1).getAttribute("dir")).toBe("rtl");
    expect(option(root, 2).hasAttribute("dir")).toBe(false);
    expect(option(root, 2).getAttribute("lang")).toBeNull();
    await cleanup();
    // A Turkish text with an Arabic phrase: the page's direction (no dir of
    // its own, so <html dir> decides), the phrase an Arabic run.
    const mixed = await render(
      wrap(
        <ExamEditor
          courseId="c1"
          draft={saved({ text: "“Hamd” ne demek: الْحَمْدُ لِلَّهِ" })}
        />
      )
    );
    const line = mixed.querySelector(
      'article[aria-label="1. soru"] button[tabindex="-1"] > span'
    ) as HTMLElement;
    expect(line.hasAttribute("dir")).toBe(false);
    expect(line.getAttribute("lang")).toBeNull();
    expect(line.querySelector("[lang=ar]")?.textContent).toBe("الْحَمْدُ لِلَّهِ");
    await cleanup();
    // A Turkish question that opens with a hadith stays left to right; the
    // hadith, its ﷺ and its « » are one Arabic run, the dash Turkish.
    const hadith = await render(
      wrap(
        <ExamEditor
          courseId="c1"
          draft={saved({
            text: "قَالَ رَسُولُ اللَّهِ ﷺ: «إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ» — bu hadisin konusu nedir?",
          })}
        />
      )
    );
    const box = hadith.querySelector(
      'article[aria-label="1. soru"] button[tabindex="-1"]'
    ) as HTMLElement;
    expect(box.hasAttribute("dir")).toBe(false);
    const runs = [...box.querySelectorAll("[lang=ar]")];
    expect(runs.map((r) => [r.textContent, r.getAttribute("dir")])).toEqual([
      ["قَالَ رَسُولُ اللَّهِ ﷺ: «إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ»", "rtl"],
    ]);
    expect(box.textContent).toContain("» — bu hadisin konusu nedir?");
  });

  it("takes the blank new form off when another question is opened, leaving no empty row (MDRS-248)", async () => {
    actions.addExamQuestion.mockResolvedValue({
      success: true,
      data: { version: 2, question: { id: "q2" } },
    });
    actions.saveExamQuestion.mockImplementation(async (_e, id, body) =>
      echo(id, body, 3)
    );
    const root = await render(
      wrap(<ExamEditor courseId="c1" draft={saved()} />)
    );
    await click(button(root, "Soru ekle"));
    await typeInto(textOf(root), "İcmanın rüknü nedir?");
    await click(button(root, "Kaydet"));
    await settle();
    expect(forms(root)[0]?.getAttribute("aria-label")).toBe("3. soru");
    await click(button(root, "Düzenle"));
    expect(forms(root).map((f) => f.getAttribute("aria-label"))).toEqual([
      "1. soru",
    ]);
    expect(root.querySelectorAll("article")).toHaveLength(1);
    expect(root.textContent).toContain("Sorular (2)");
    expect(root.textContent).not.toContain("Soru metni yok.");
  });

  it("sends no empty question on Cmd+Enter, held or pressed once too often (MDRS-248)", async () => {
    actions.addExamQuestion.mockResolvedValue({
      success: true,
      data: { version: 2, question: { id: "q1" } },
    });
    actions.saveExamQuestion.mockImplementation(async (_e, id, body) =>
      echo(id, body, 3)
    );
    const root = await render(wrap(<ExamEditor courseId="c1" draft={draft} />));
    await click(button(root, "Soru ekle"));
    expect(button(root, "Kaydet").disabled).toBe(true);
    await press(textOf(root), { key: "Enter", metaKey: true });
    await settle();
    expect(actions.addExamQuestion).not.toHaveBeenCalled();
    await typeInto(textOf(root), "Soru");
    // A held key repeats: only its first press saves.
    await press(textOf(root), { key: "Enter", metaKey: true, repeat: true });
    await settle();
    expect(actions.saveExamQuestion).not.toHaveBeenCalled();
    await press(textOf(root), { key: "Enter", metaKey: true });
    await settle();
    await press(textOf(root), { key: "Enter", metaKey: true });
    await settle();
    expect(actions.addExamQuestion).toHaveBeenCalledTimes(1);
    expect(actions.saveExamQuestion).toHaveBeenCalledTimes(1);
  });

  it("makes a topic typed in + Konu and saves it with the question on Cmd+Enter (MDRS-248)", async () => {
    actions.createCourseTopic.mockResolvedValue({
      success: true,
      data: { id: "t4", number: 4, name: "Tecvid" },
    });
    actions.addExamQuestion.mockResolvedValue({
      success: true,
      data: { version: 2, question: { id: "q1" } },
    });
    actions.saveExamQuestion.mockImplementation(async (_e, id, body) =>
      echo(id, body, 3)
    );
    const root = await render(wrap(<ExamEditor courseId="c1" draft={draft} />));
    await click(button(root, "Soru ekle"));
    await typeInto(textOf(root), "Med kaç çeşittir?");
    await click(button(root, "+ Konu"));
    const name = root.querySelector(
      "input[aria-label='Yeni konu']"
    ) as HTMLInputElement;
    await typeInto(name, "Tecvid");
    await press(name, { key: "Enter", metaKey: true });
    await settle(40);
    expect(actions.createCourseTopic).toHaveBeenCalledWith(
      "c1",
      "Tecvid",
      undefined
    );
    expect(actions.saveExamQuestion).toHaveBeenCalledWith(
      "e1",
      "q1",
      expect.objectContaining({ topicIds: ["t4"] })
    );
  });
});

describe("the talebe-notes icon in the editor (MDRS-248)", () => {
  const saved = (talebeNotes?: boolean) =>
    ({
      ...draft,
      questions: [
        {
          id: "q1",
          number: 1,
          text: "Kıyasın rükünleri kaç tanedir?",
          options: [
            { id: "o1", text: "Dört", correct: true },
            { id: "o2", text: "Üç", correct: false },
          ],
          answerMode: "SINGLE",
          scoring: null,
          topicIds: ["t3"],
          ownPoints: null,
          points: "100.00",
          complete: true,
          lacks: [],
          ...(talebeNotes === undefined ? {} : { talebeNotes }),
        },
      ],
    }) as unknown as OnlineExamDraftResponse;
  const icon = (root: HTMLElement) =>
    root.querySelector("button[data-talebe-notes]") as HTMLButtonElement;

  it("turns a saved row's notes on at once, and sends it outside the version queue", async () => {
    actions.setExamQuestionTalebeNotes.mockReturnValue(
      later({ success: true, data: { questionId: "q1", talebeNotes: true } })
    );
    const root = await render(
      wrap(<ExamEditor courseId="c1" draft={saved(false)} />)
    );
    expect(icon(root).getAttribute("aria-pressed")).toBe("false");
    // One name in both states: aria-pressed says which.
    expect(icon(root).getAttribute("aria-label")).toBe("Talebe notları");
    await click(icon(root));
    // Shown before the server answers.
    expect(icon(root).getAttribute("aria-pressed")).toBe("true");
    expect(icon(root).getAttribute("aria-label")).toBe("Talebe notları");
    // The row's form does not open while the icon is being written.
    await click(button(root, "Düzenle"));
    expect(root.querySelector("form[data-question]")).toBeNull();
    expect(actions.setExamQuestionTalebeNotes).toHaveBeenCalledWith(
      "e1",
      "q1",
      true
    );
    held.shift()?.();
    await settle();
    expect(icon(root).getAttribute("aria-pressed")).toBe("true");
    // It names no version: no question write went out.
    expect(actions.saveExamQuestion).not.toHaveBeenCalled();
    // A newer read that predates the write keeps the state the page set.
    await rerender(
      root,
      wrap(
        <ExamEditor
          courseId="c1"
          draft={{ ...saved(false), version: 5 } as OnlineExamDraftResponse}
        />
      )
    );
    expect(icon(root).getAttribute("aria-pressed")).toBe("true");
    await click(button(root, "Düzenle"));
    expect(root.querySelector("form[data-question]")).not.toBeNull();
  });

  it("takes the icon back and says so when the write is refused", async () => {
    actions.setExamQuestionTalebeNotes.mockResolvedValue({
      success: false,
      code: "QUESTION_NOT_FOUND",
    });
    const root = await render(
      wrap(<ExamEditor courseId="c1" draft={saved(true)} />)
    );
    expect(icon(root).getAttribute("aria-pressed")).toBe("true");
    await click(icon(root));
    await settle();
    expect(icon(root).getAttribute("aria-pressed")).toBe("true");
    expect(document.body.textContent).toContain(
      "Talebe notu ayarı kaydedilemedi"
    );
  });

  it("takes the icon back when the write throws", async () => {
    actions.setExamQuestionTalebeNotes.mockRejectedValue(new Error("down"));
    const root = await render(
      wrap(<ExamEditor courseId="c1" draft={saved(false)} />)
    );
    await click(icon(root));
    await settle();
    expect(icon(root).getAttribute("aria-pressed")).toBe("false");
  });

  it("reads a question without the field by the set's default: on in a çalışma seti, off in an exam", async () => {
    const exam = await render(
      wrap(<ExamEditor courseId="c1" draft={saved()} />)
    );
    expect(icon(exam).getAttribute("aria-pressed")).toBe("false");
    await cleanup();
    const set = await render(
      wrap(<ExamEditor courseId="c1" draft={saved()} kind="PRACTICE" />)
    );
    expect(icon(set).getAttribute("aria-pressed")).toBe("true");
  });

  it("puts the icon in a new question's form, beside its buttons, and sends it with the save", async () => {
    actions.addExamQuestion.mockResolvedValue({
      success: true,
      data: { version: 2, question: { id: "q1" } },
    });
    actions.saveExamQuestion.mockImplementation(async (_e, id, body) => ({
      success: true,
      data: {
        version: 3,
        question: {
          id,
          number: 1,
          text: body.text,
          options: [],
          answerMode: "SINGLE",
          scoring: null,
          topicIds: body.topicIds,
          ownPoints: null,
          points: "100.00",
          complete: false,
          lacks: [],
          talebeNotes: body.talebeNotes,
        },
      },
    }));
    const root = await render(
      wrap(<ExamEditor courseId="c1" draft={draft} kind="PRACTICE" />)
    );
    await click(button(root, "Soru ekle"));
    const form = root.querySelector("form[data-question]") as HTMLFormElement;
    const toggle = icon(form);
    // In the row of Kaydet and Vazgeç: no line of its own.
    expect(toggle.closest("div")?.textContent).toContain("Kaydet");
    // A new question of a set takes notes.
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    await click(toggle);
    expect(icon(form).getAttribute("aria-pressed")).toBe("false");
    // Pressing it writes nothing until the question is saved.
    expect(actions.setExamQuestionTalebeNotes).not.toHaveBeenCalled();
    await typeInto(
      root.querySelector(QUESTION_TEXT) as HTMLTextAreaElement,
      "Bir soru"
    );
    await click(button(root, "Kaydet"));
    await settle();
    expect(actions.saveExamQuestion).toHaveBeenCalledWith(
      "e1",
      "q1",
      expect.objectContaining({ talebeNotes: false })
    );
  });
});

describe("a long question on its one-line row (MDRS-248, uzun soru)", () => {
  it("shows the first line and says more follows", () => {
    expect(
      rowText(
        "Âyetü'l-Kürsî şöyle başlar:\n\nاللَّهُ لَا إِلَٰهَ إِلَّا هُوَ\n\nHangi sûrededir?"
      )
    ).toBe("Âyetü'l-Kürsî şöyle başlar: …");
    expect(rowText("Tek satırlık soru?")).toBe("Tek satırlık soru?");
    expect(rowText("\n  Boş satırla başlayan\n")).toBe("Boş satırla başlayan");
    expect(rowText("")).toBe("");
  });
});
