import { resources } from "@medaris/i18n";
import type {
  PracticeAttemptResponse,
  PracticeSetSummaryResponse,
} from "@medaris/services/tedrisat";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  actionOf,
  blankCount,
  groupByCourse,
  percentText,
  startIndex,
} from "~/features/practice/practice-model";

/**
 * Çalışma Soruları (MDRS-248, Faz 3): the list by course with "Başla",
 * "Devam et" and "Tekrar çöz", and a finished attempt's result with the
 * talebe's choices and the correct options, rendered with the real Turkish
 * catalogue.
 */

const text = (key: string) =>
  key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown>)?.[part],
      resources.tr.tedris.Practice
    ) as string;
const lookup = (key: string, values: Record<string, unknown> = {}) =>
  Object.entries(values).reduce(
    (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
    text(key)
  );
vi.mock("next-intl/server", () => ({
  getTranslations: async () => lookup,
  getLocale: async () => "tr",
  getTimeZone: async () => "Europe/Istanbul",
}));

const set = (
  over: Partial<PracticeSetSummaryResponse>
): PracticeSetSummaryResponse => ({
  id: "s1",
  courseId: "c1",
  courseTitle: "Emsile",
  title: "Birinci bab",
  instructions: null,
  questionCount: 10,
  attemptCount: 0,
  lastPercent: null,
  openAttemptId: null,
  publishedAt: new Date("2026-11-20T10:00:00Z"),
  ...over,
});

const finished: PracticeAttemptResponse = {
  id: "a1",
  setId: "s1",
  courseId: "c1",
  title: "Birinci bab",
  status: "FINISHED",
  startedAt: new Date("2026-11-27T10:00:00Z"),
  finishedAt: new Date("2026-11-27T10:20:00Z"),
  currentQuestionId: "q2",
  questions: [
    {
      id: "q1",
      number: 1,
      text: "Nasara hangi babdandır?",
      answerMode: "SINGLE",
      options: [
        { id: "o1", text: "Birinci bab", correct: true },
        { id: "o2", text: "İkinci bab", correct: false },
      ],
      chosenOptionIds: ["o2"],
      outcome: "WRONG",
      part: "0.00",
    },
    {
      id: "q2",
      number: 2,
      text: "Daraba hangi babdandır?",
      answerMode: "SINGLE",
      options: [
        { id: "o3", text: "Birinci bab", correct: false },
        { id: "o4", text: "İkinci bab", correct: true },
      ],
      chosenOptionIds: ["o4"],
      outcome: "CORRECT",
      part: "1.00",
    },
    {
      id: "q3",
      number: 3,
      text: "Fetaha hangi babdandır?",
      answerMode: "SINGLE",
      options: [
        { id: "o5", text: "Üçüncü bab", correct: true },
        { id: "o6", text: "Dördüncü bab", correct: false },
      ],
      chosenOptionIds: [],
      outcome: "BLANK",
      part: "0.00",
    },
  ],
  result: { correct: 1, wrong: 1, blank: 1, total: 3, percent: "33.33" },
};

describe("the çalışma soruları model (MDRS-248)", () => {
  it("groups the sets by course in the API's order", () => {
    const groups = groupByCourse([
      set({ id: "a" }),
      set({ id: "b", courseId: "c2", courseTitle: "Bina" }),
      set({ id: "c" }),
    ]);
    expect(groups.map((g) => [g.courseTitle, g.sets.map((s) => s.id)])).toEqual(
      [
        ["Emsile", ["a", "c"]],
        ["Bina", ["b"]],
      ]
    );
  });

  it("leads to Başla, Devam et or Tekrar çöz", () => {
    expect(actionOf(set({}))).toBe("start");
    expect(actionOf(set({ openAttemptId: "x", attemptCount: 2 }))).toBe(
      "continue"
    );
    expect(actionOf(set({ attemptCount: 1 }))).toBe("again");
  });

  it("writes a percentage the Turkish way", () => {
    expect(percentText("62.50", "tr")).toBe("%62,5");
    expect(percentText("100.00", "tr")).toBe("%100");
  });

  it("goes on at the question it was left at, else the first blank one", () => {
    const q = (id: string, chosen: string[]) =>
      ({ id, chosenOptionIds: chosen }) as never;
    expect(
      startIndex({
        currentQuestionId: "q2",
        questions: [q("q1", ["a"]), q("q2", ["b"]), q("q3", [])],
      })
    ).toBe(1);
    expect(
      startIndex({
        currentQuestionId: null,
        questions: [q("q1", ["a"]), q("q2", []), q("q3", [])],
      })
    ).toBe(1);
    expect(
      blankCount(
        ["q1", "q2", "q3"],
        new Map([
          ["q1", ["a"]],
          ["q2", []],
        ])
      )
    ).toBe(2);
  });
});

describe("the Çalışma Soruları page (MDRS-248)", () => {
  const renderList = async (sets: PracticeSetSummaryResponse[] | null) => {
    const { PracticeListPage } = await import(
      "~/features/practice/components/practice-list-page"
    );
    return renderToStaticMarkup(await PracticeListPage({ sets }));
  };

  it("lists the sets by course with their counts and the last result", async () => {
    const html = await renderList([
      set({ id: "a" }),
      set({ id: "b", attemptCount: 2, lastPercent: "75.00" }),
      set({ id: "c", openAttemptId: "x", attemptCount: 1 }),
    ]);
    expect(html).toContain('id="ders-c1"');
    expect(html).toContain(">Emsile<");
    expect(html).toContain("10 soru · 2 deneme");
    expect(html).toContain("Son sonucun: %75");
    expect(html).toContain('href="/calisma-sorulari/a"');
    expect(html).toContain(">Başla<");
    expect(html).toContain(">Tekrar çöz<");
    expect(html).toContain(">Devam et<");
  });

  it("says when there is nothing yet, and when the read failed", async () => {
    expect(await renderList([])).toContain("Henüz çalışma sorusu yok.");
    expect(await renderList(null)).toContain("Çalışma soruları okunamadı");
  });
});

describe("a finished çalışma attempt (MDRS-248)", () => {
  const renderResult = async (attempt: PracticeAttemptResponse) => {
    const { PracticeResult } = await import(
      "~/features/practice/components/practice-result"
    );
    return renderToStaticMarkup(
      await PracticeResult({ read: { status: "ok", attempt } })
    );
  };

  it("shows the percentage, the counts and every choice beside the correct option", async () => {
    const html = await renderResult(finished);
    expect(html).toContain("%33,33");
    expect(html).toMatch(/data-testid="practice-correct">1</);
    expect(html).toMatch(/data-testid="practice-wrong">1</);
    expect(html).toMatch(/data-testid="practice-blank">1</);
    // The wrong one: the choice in the info colour, the correct option in success.
    expect(html).toContain('data-outcome="WRONG"');
    expect(html).toMatch(
      /data-chosen="true"[^>]*>.*?İkinci bab.*?mds-badge--info[^>]*>Senin seçimin/
    );
    expect(html).toMatch(
      /data-correct="true"[^>]*>.*?Birinci bab.*?mds-badge--success[^>]*>Doğru şık/
    );
    expect(html).toContain("Bu soruyu boş bıraktın.");
    expect(html).toContain('href="/calisma-sorulari/s1"');
    expect(html).toContain(">Tekrar çöz<");
    expect(html).toContain(">Çalışma sorularına dön<");
  });

  it("leads an attempt in progress back to it", async () => {
    const html = await renderResult({
      ...finished,
      status: "IN_PROGRESS",
      finishedAt: null,
      result: null,
    });
    expect(html).toContain("Bu deneme sürüyor");
    expect(html).toContain('href="/calisma-sorulari/s1"');
    expect(html).not.toContain("Doğru şık");
  });
});
