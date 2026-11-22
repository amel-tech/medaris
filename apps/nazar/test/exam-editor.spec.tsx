// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type { OnlineExamDraftResponse } from "@medaris/services/tedrisat";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExamEditor } from "~/features/online-exams/components/exam-editor";
import { cleanup, click, render, settle, type as typeInto } from "./dom";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
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
};
vi.mock("~/features/online-exams/actions", () => ({
  addExamQuestion: (...a: unknown[]) => actions.addExamQuestion(...a),
  saveExamQuestion: (...a: unknown[]) => actions.saveExamQuestion(...a),
  removeExamQuestion: (...a: unknown[]) => actions.removeExamQuestion(...a),
  createCourseTopic: (...a: unknown[]) => actions.createCourseTopic(...a),
  createOnlineExam: (...a: unknown[]) => actions.createOnlineExam(...a),
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

const button = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll("button")].find(
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
    const [text] = [...root.querySelectorAll("textarea")];
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
    await typeInto(
      inputs.find(
        (i) => i.getAttribute("placeholder") === "3, 7"
      ) as HTMLInputElement,
      "3"
    );
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
      root.querySelector("textarea") as HTMLTextAreaElement,
      "Bir soru"
    );
    await click(button(root, "Kaydet"));
    await settle();
    expect(root.textContent).toContain("Bir soru");
    expect(root.textContent).toContain("Kaydedilemedi");
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
    body: { text: string; options: object[]; topicIds: string[] },
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
        answerMode: "SINGLE",
        scoring: null,
        topicIds: body.topicIds,
        ownPoints: null,
        points: "100.00",
        complete: false,
        lacks: [],
      },
    },
  });
  const textOf = (root: HTMLElement) =>
    root.querySelector("textarea") as HTMLTextAreaElement;

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
    await typeInto(
      [...root.querySelectorAll("input")].find(
        (i) => i.getAttribute("placeholder") === "3, 7"
      ) as HTMLInputElement,
      "7"
    );
    await click(button(root, "Kaydet"));
    held.shift()?.(); // the topic is made
    await settle();
    expect(actions.saveExamQuestion).toHaveBeenCalledWith(
      "e1",
      "q1",
      expect.objectContaining({ topicIds: ["t7"] })
    );
  });
});
