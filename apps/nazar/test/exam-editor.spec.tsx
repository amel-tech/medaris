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
  setExamQuestionPoints: vi.fn(),
  removeCourseTopic: vi.fn(),
  saveExamSettings: vi.fn(),
};
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
      root.querySelector(QUESTION_TEXT) as HTMLTextAreaElement,
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
  const topicNumbers = (root: HTMLElement) =>
    [...root.querySelectorAll("input")].find(
      (i) => i.getAttribute("placeholder") === "3, 7"
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
    await typeInto(topicNumbers(root), "3");
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
    await typeInto(topicNumbers(root), "3");
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
    [...document.querySelectorAll("#topics-title ~ ul li")].map((li) =>
      li.textContent?.trim()
    );

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

  it("draws an Arabic option as its own Arabic run, with Doğru beside it", async () => {
    const arabic = {
      ...draft,
      questions: [
        {
          id: "q1",
          number: 1,
          text: "Aşağıdakilerden hangisinde haber şibh-i cümle gelmiştir?",
          options: [
            { id: "o1", text: "زَيْدٌ ذَهَبَ إِلَى الْبَيْتِ", correct: false },
            { id: "o2", text: "زَيْدٌ فِي الدَّارِ", correct: true },
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
    const root = await render(
      wrap(<ExamEditor courseId="c1" draft={arabic} />)
    );
    const items = [...root.querySelectorAll("ol[type=A] > li")];
    expect(items).toHaveLength(2);
    const [, second] = items as HTMLElement[];
    expect(second.getAttribute("dir")).toBeNull();
    const run = second.querySelector("[lang=ar]") as HTMLElement;
    expect(run.getAttribute("dir")).toBe("rtl");
    expect(run.textContent).toBe("زَيْدٌ فِي الدَّارِ");
    expect(run.textContent).not.toContain("Doğru");
    expect(second.textContent).toContain("Doğru");
    // The Latin question text is left to the browser.
    const question = [...root.querySelectorAll("p")].find((p) =>
      p.textContent?.startsWith("Aşağıdakilerden")
    ) as HTMLElement;
    expect(question.getAttribute("dir")).toBe("auto");
    expect(question.getAttribute("lang")).toBeNull();
  });
});
