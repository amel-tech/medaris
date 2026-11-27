// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type {
  OnlineExamResultsResponse,
  TalebeAnswersResponse,
} from "@medaris/services/tedrisat";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResultsView } from "~/features/online-exams/components/results-view";
import { TalebeAnswersView } from "~/features/online-exams/components/talebe-answers-view";
import { cleanup, render } from "./dom";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("~/features/online-exams/results-actions", () => ({
  readExamResults: vi.fn(),
  closeExamEarly: vi.fn(),
}));
vi.mock("~/features/evaluation/actions", () => ({
  releaseExamResults: vi.fn(),
}));

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

const answers = {
  exam: { id: "e1", title: "Ara sınav" },
  userId: "u1",
  name: "Zeynep Örnek",
  state: "FINISHED",
  startedAt: new Date("2026-11-28T17:02:00Z"),
  finishedAt: new Date("2026-11-28T17:40:00Z"),
  finishedBy: "TALEBE",
  score: "50.00",
  switches: [{ at: new Date("2026-11-28T17:05:00Z") }],
  zeroth: {
    question: "Bu hadisi ne zaman öğrendin?",
    optionId: "z1",
    answer: "Bu dönem",
  },
  questions: [
    {
      questionId: "q1",
      number: 1,
      text: "Kıyasın rükünleri kaç tanedir?",
      answerMode: "SINGLE",
      scoring: null,
      points: "50.00",
      earned: "0.00",
      verdict: "WRONG",
      skipped: false,
      savedAt: new Date("2026-11-28T17:10:00Z"),
      options: [
        { id: "o1", text: "Üç", correct: false, chosen: true },
        { id: "o2", text: "Dört", correct: true, chosen: false },
      ],
    },
    {
      questionId: "q2",
      number: 2,
      text: "مَنْ غَشَّنَا فَلَيْسَ مِنَّا",
      answerMode: "SINGLE",
      scoring: null,
      points: "50.00",
      earned: "0.00",
      verdict: "BLANK",
      skipped: true,
      savedAt: null,
      options: [
        { id: "o3", text: "Sahih", correct: true, chosen: false },
        { id: "o4", text: "Zayıf", correct: false, chosen: false },
      ],
    },
  ],
} as unknown as TalebeAnswersResponse;

afterEach(async () => {
  await cleanup();
});

describe("a talebe's answers on an online exam (MDRS-299)", () => {
  it("marks the talebe's choice with a check and words, the correct option with the badge, and the points earned", async () => {
    const root = await render(wrap(<TalebeAnswersView answers={answers} />));
    const first = root.querySelectorAll("article")[0];
    expect(first.textContent).toContain("1. soru");
    expect(first.textContent).toContain("Yanlış cevap verdi");
    expect(first.textContent).toContain("0.00 / 50.00 puan aldı");
    const [three, four] = [...first.querySelectorAll("li")];
    expect(three.textContent).toContain("✓");
    expect(three.textContent).toContain("(seçtiği)");
    expect(three.textContent).not.toContain("Doğru");
    expect(four.textContent).toContain("Doğru");
    expect(four.textContent).not.toContain("(seçtiği)");
    expect(root.textContent).toContain("Puan: 50.00 / 100");
    expect(root.textContent).toContain("1 kez sekme değiştirdi: 20:05:00");
    expect(root.textContent).toContain("Bu dönem");
  });

  it("says a skipped question was left blank, and draws Arabic text as Arabic", async () => {
    const root = await render(wrap(<TalebeAnswersView answers={answers} />));
    const second = root.querySelectorAll("article")[1];
    expect(second.textContent).toContain("Atladı, boş kaldı");
    const arabic = second.querySelector("p [lang=ar]") as HTMLElement;
    expect(arabic?.getAttribute("dir")).toBe("rtl");
    expect(arabic?.parentElement?.getAttribute("dir")).toBe("rtl");
  });

  it("opens a talebe's answers from the results row of one who started, and not of one who did not", async () => {
    const results = {
      exam: {
        id: "e1",
        courseId: "c1",
        lessonId: "l1",
        title: "Ara sınav",
        durationMinutes: 30,
        startsAt: new Date("2026-11-28T17:00:00Z"),
        latestStartAt: new Date("2026-11-28T17:10:00Z"),
        closedEarlyAt: null,
        closed: false,
        mayClose: true,
      },
      talebe: [
        {
          userId: "u1",
          name: "Zeynep Örnek",
          state: "FINISHED",
          startedAt: new Date("2026-11-28T17:02:00Z"),
          finishedAt: new Date("2026-11-28T17:40:00Z"),
          finishedBy: "TALEBE",
          score: "50.00",
          right: 1,
          wrong: 1,
          blank: 0,
          switches: [],
          zerothOptionId: null,
          topics: [],
        },
        {
          userId: "u2",
          name: "Ahmet Örnek",
          state: "NOT_STARTED",
          startedAt: null,
          finishedAt: null,
          finishedBy: null,
          score: null,
          right: null,
          wrong: null,
          blank: null,
          switches: [],
          zerothOptionId: null,
          topics: [],
        },
      ],
      counts: {
        seats: 2,
        started: 1,
        inProgress: 0,
        finished: 1,
        missed: 0,
        average: "50.00",
      },
      topics: [],
      questions: [],
      zeroth: { question: "", options: [] },
      released: false,
      releasedAt: null,
      mayRelease: true,
      releasable: true,
    } as unknown as OnlineExamResultsResponse;
    const root = await render(wrap(<ResultsView initial={results} />));
    const links = [...root.querySelectorAll("a")].filter((a) =>
      a.getAttribute("href")?.includes("/sonuclar/")
    );
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/ders/c1/sinavlar/e1/sonuclar/u1",
    ]);
    expect(links[0].getAttribute("aria-label")).toBe(
      "Zeynep Örnek: cevaplarını aç"
    );
  });
});
