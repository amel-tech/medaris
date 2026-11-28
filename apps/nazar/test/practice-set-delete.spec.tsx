// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type { OnlineExamDraftResponse } from "@medaris/services/tedrisat";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExamWorkspace } from "~/features/online-exams/components/exam-workspace";
import {
  type PracticeSetRow,
  PracticeSetsTable,
} from "~/features/online-exams/components/practice-sets-table";
import {
  cleanup,
  click,
  pick,
  render,
  rerender,
  settle,
  type as typeInto,
} from "./dom";

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push }),
  unstable_isUnrecognizedActionError: () => false,
}));

const deletePracticeSet = vi.fn();
const addExamQuestion = vi.fn();
// The talebe-notes icon and answers (MDRS-248): question-notes.spec covers them.
vi.mock("~/features/online-exams/notes-actions", () => ({
  setExamQuestionTalebeNotes: vi.fn(),
  replyQuestionNote: vi.fn(),
}));
vi.mock("~/features/online-exams/actions", () => ({
  deletePracticeSet: (...a: unknown[]) => deletePracticeSet(...a),
  addExamQuestion: (...a: unknown[]) => addExamQuestion(...a),
  saveExamQuestion: vi.fn(),
  removeExamQuestion: vi.fn(),
  createCourseTopic: vi.fn(),
  setExamQuestionPoints: vi.fn(),
  removeCourseTopic: vi.fn(),
  saveExamSettings: vi.fn(),
  publishOnlineExam: vi.fn(),
  unpublishOnlineExam: vi.fn(),
}));

const rows: PracticeSetRow[] = [
  {
    id: "s1",
    title: "Kıyas tekrarı",
    draft: false,
    locked: true,
    questionCount: 4,
    talebeCount: 3,
    attemptCount: 5,
    averagePercent: "72.50",
  },
  {
    id: "s2",
    title: "Tarifler",
    draft: true,
    locked: false,
    questionCount: 0,
    talebeCount: null,
    attemptCount: null,
    averagePercent: null,
  },
];

const complete = {
  id: "q1",
  number: 1,
  text: "Kıyasın rükünleri kaç tanedir?",
  options: [
    { id: "o1", text: "Üç", correct: false },
    { id: "o2", text: "Dört", correct: true },
  ],
  answerMode: "SINGLE",
  scoring: null,
  topicIds: [],
  ownPoints: null,
  points: "100.00",
  complete: true,
  lacks: [],
};
const set = {
  id: "s2",
  courseId: "c1",
  kind: "PRACTICE",
  title: "Tarifler",
  durationMinutes: null,
  instructions: null,
  zerothQuestion: null,
  zerothOptions: null,
  courseTopics: [],
  topicIds: [],
  questions: [complete],
  pointsTotal: "100.00",
  status: "DRAFT",
  locked: false,
  startsAt: null,
  latestStartAt: null,
  problems: [],
  version: 3,
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
const table = () =>
  render(wrap(<PracticeSetsTable courseId="c1" rows={rows} />));
const page = (draft: OnlineExamDraftResponse) =>
  render(
    wrap(
      <ExamWorkspace
        courseId="c1"
        draft={draft}
        timeZone="Europe/Istanbul"
        locale="tr"
      />
    )
  );
const button = (root: ParentNode, label: string) =>
  [...root.querySelectorAll("button")].find(
    (b) =>
      b.textContent?.trim() === label || b.getAttribute("aria-label") === label
  ) as HTMLButtonElement | undefined;
const rowOf = (title: string) =>
  [...document.querySelectorAll("tbody tr")].find((tr) =>
    tr.textContent?.includes(title)
  ) as HTMLElement;
const dialog = () =>
  document.querySelector("[role=alertdialog]") as HTMLElement | null;

afterEach(async () => {
  await cleanup();
  vi.clearAllMocks();
});

describe("Sil in Çalışma Soruları (MDRS-248)", () => {
  it("puts a Sil in every row, off with its reason on a started set", async () => {
    await table();
    const draft = button(rowOf("Tarifler"), "Sil") as HTMLButtonElement;
    expect(draft.disabled).toBe(false);
    expect(draft.getAttribute("aria-label")).toBe("“Tarifler” setini sil");
    const started = button(rowOf("Kıyas tekrarı"), "Sil") as HTMLButtonElement;
    expect(started.disabled).toBe(true);
    const reason = document.getElementById(
      started.getAttribute("aria-describedby") as string
    );
    expect(reason?.textContent).toBe("Kullanıldı, silinemez");
    expect(rowOf("Kıyas tekrarı").textContent).toContain(
      "Kullanıldı, silinemez"
    );
  });

  it("asks, naming the set, then deletes it and reads the list again", async () => {
    deletePracticeSet.mockResolvedValue({ success: true, data: { id: "s2" } });
    await table();
    await click(button(rowOf("Tarifler"), "Sil") as HTMLButtonElement);
    await settle(40);
    expect(dialog()?.textContent).toContain("“Tarifler” seti silinsin mi?");
    expect(dialog()?.textContent).toContain("Soruları da silinir.");
    expect(deletePracticeSet).not.toHaveBeenCalled();
    await click(button(dialog() as HTMLElement, "Seti sil") as HTMLElement);
    await settle(60);
    expect(deletePracticeSet).toHaveBeenCalledWith("s2");
    expect(refresh).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("“Tarifler” silindi");
  });

  it("deletes nothing on Vazgeç", async () => {
    await table();
    await click(button(rowOf("Tarifler"), "Sil") as HTMLButtonElement);
    await settle(40);
    await click(button(dialog() as HTMLElement, "Vazgeç") as HTMLElement);
    await settle(40);
    expect(deletePracticeSet).not.toHaveBeenCalled();
  });

  it("says in words why a set was not deleted", async () => {
    deletePracticeSet.mockResolvedValue({
      success: false,
      code: "EXAM_LOCKED",
    });
    await table();
    await click(button(rowOf("Tarifler"), "Sil") as HTMLButtonElement);
    await settle(40);
    await click(button(dialog() as HTMLElement, "Seti sil") as HTMLElement);
    await settle(60);
    expect(document.body.textContent).toContain("Set silinemedi");
    expect(document.body.textContent).toContain(
      "Bir talebe bu seti çözmeye başladı ya da bir havuz denemesi ondan soru aldı; artık silinemez."
    );
    expect(refresh).toHaveBeenCalled();
  });
});

describe("Seti sil on a set's page (MDRS-248)", () => {
  it("deletes the set and goes back to Çalışma Soruları", async () => {
    deletePracticeSet.mockResolvedValue({ success: true, data: { id: "s2" } });
    const root = await page(set);
    await click(button(root, "Seti sil") as HTMLButtonElement);
    await settle(40);
    expect(dialog()?.textContent).toContain("“Tarifler” seti silinsin mi?");
    await click(button(dialog() as HTMLElement, "Seti sil") as HTMLElement);
    await settle(60);
    expect(deletePracticeSet).toHaveBeenCalledWith("s2");
    expect(push).toHaveBeenCalledWith("/ders/c1/calisma-sorulari");
  });

  it("turns off when a read of the same version says the set is locked", async () => {
    const root = await page(set);
    expect((button(root, "Seti sil") as HTMLButtonElement).disabled).toBe(
      false
    );
    await rerender(
      root,
      wrap(
        <ExamWorkspace
          courseId="c1"
          draft={{ ...set, locked: true } as OnlineExamDraftResponse}
          timeZone="Europe/Istanbul"
          locale="tr"
        />
      )
    );
    expect((button(root, "Seti sil") as HTMLButtonElement).disabled).toBe(true);
  });

  it("is off on a set a talebe started, and says why", async () => {
    const root = await page({
      ...set,
      status: "OPEN",
      locked: true,
    } as unknown as OnlineExamDraftResponse);
    const off = button(root, "Seti sil") as HTMLButtonElement;
    expect(off.disabled).toBe(true);
    expect(
      document.getElementById(off.getAttribute("aria-describedby") as string)
        ?.textContent
    ).toBe(
      "Bir talebe bu seti çözmeye başladı ya da bir havuz denemesi ondan soru aldı; artık silinemez."
    );
  });
});

describe("Soru ekle while a saved question is open (MDRS-248)", () => {
  const textarea = () =>
    document.querySelector("form[data-question] textarea") as
      | HTMLTextAreaElement
      | undefined;

  it("asks before dropping a change, and keeps it on Soruya dön", async () => {
    const root = await page(set);
    await click(button(root, "1. soruyu düzenle") as HTMLButtonElement);
    await typeInto(textarea() as HTMLTextAreaElement, "Kıyasın rükünleri?");
    await click(button(root, "Soru ekle") as HTMLButtonElement);
    await settle(40);
    expect(dialog()?.textContent).toContain(
      "Açık sorudaki değişiklikler kaydedilmedi"
    );
    await click(button(dialog() as HTMLElement, "Soruya dön") as HTMLElement);
    await settle(40);
    expect(textarea()?.value).toBe("Kıyasın rükünleri?");
    expect(document.querySelectorAll("form[data-question]")).toHaveLength(1);
  });

  it("opens the new question once the change is let go", async () => {
    const root = await page(set);
    await click(button(root, "1. soruyu düzenle") as HTMLButtonElement);
    await typeInto(textarea() as HTMLTextAreaElement, "Kıyasın rükünleri?");
    await click(button(root, "Soru ekle") as HTMLButtonElement);
    await settle(40);
    await click(
      button(dialog() as HTMLElement, "Değişiklikleri bırak") as HTMLElement
    );
    await settle(40);
    expect(textarea()?.value).toBe("");
    expect(root.textContent).toContain("Kıyasın rükünleri kaç tanedir?");
  });

  it("counts a topic picked in the list as a change", async () => {
    const root = await page({
      ...set,
      courseTopics: [
        { id: "t3", number: 3, name: "Kıyas", picked: false, questionCount: 0 },
      ],
    } as unknown as OnlineExamDraftResponse);
    await click(button(root, "1. soruyu düzenle") as HTMLButtonElement);
    await pick(
      root.querySelector("form input[role=combobox]") as HTMLInputElement,
      "3. Kıyas"
    );
    await click(button(root, "Soru ekle") as HTMLButtonElement);
    await settle(40);
    expect(dialog()?.textContent).toContain(
      "Açık sorudaki değişiklikler kaydedilmedi"
    );
  });

  it("opens the new question at once when nothing changed", async () => {
    const root = await page(set);
    await click(button(root, "1. soruyu düzenle") as HTMLButtonElement);
    await click(button(root, "Soru ekle") as HTMLButtonElement);
    await settle(40);
    expect(dialog()).toBeNull();
    expect(textarea()?.value).toBe("");
  });
});
