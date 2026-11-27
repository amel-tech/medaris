import { resources } from "@medaris/i18n";
import type {
  PracticeAttemptResponse,
  PracticePoolResponse,
  PracticeSetSummaryResponse,
} from "@medaris/services/tedrisat";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  actionOf,
  againHref,
  blankCount,
  continueHref,
  groupByCourse,
  percentText,
  poolHref,
  poolRequestOf,
  randomDefault,
  startIndex,
} from "~/features/practice/practice-model";
import { intlMock } from "./intl-mock";

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
// The result's body is a client component: the real catalogue behind useTranslations.
vi.mock("next-intl", async (orig) => intlMock(await orig()));
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
  poolMode: null,
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
      setTitle: "Birinci bab",
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
      setTitle: "Birinci bab",
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
      setTitle: "Birinci bab",
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

  it("writes a percentage the Turkish way, as a whole number", () => {
    expect(percentText("62.50", "tr")).toBe("%63");
    expect(percentText("83.33", "tr")).toBe("%83");
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

describe("the pool's model (MDRS-248, Faz 4)", () => {
  it("offers 50 questions at random, or the whole pool when smaller", () => {
    expect(randomDefault(500)).toBe(50);
    expect(randomDefault(12)).toBe(12);
  });

  it("writes and reads the pool page's address", () => {
    expect(poolHref("c1")).toBe("/calisma-sorulari/havuz/c1");
    expect(poolHref("c1", "ALL")).toBe("/calisma-sorulari/havuz/c1?mod=ALL");
    expect(poolHref("c1", "RANDOM", 20)).toBe(
      "/calisma-sorulari/havuz/c1?mod=RANDOM&sayi=20"
    );
    expect(poolRequestOf({})).toEqual({ mode: "ALL" });
    expect(poolRequestOf({ mod: "RANDOM", sayi: "20" })).toEqual({
      mode: "RANDOM",
      count: 20,
    });
    // No count, or not a whole number: the API refuses it.
    expect(poolRequestOf({ mod: "RANDOM", sayi: "2.5" })).toEqual({
      mode: "RANDOM",
    });
  });

  it("leads a pool attempt back to its course's pool", () => {
    const pooled = { setId: null, courseId: "c1" };
    expect(continueHref(pooled)).toBe("/calisma-sorulari/havuz/c1");
    expect(againHref(pooled)).toBe("/calisma-sorulari#ders-c1");
    expect(againHref({ setId: "s1", courseId: "c1" })).toBe(
      "/calisma-sorulari/s1"
    );
  });
});

describe("the Çalışma Soruları page (MDRS-248)", () => {
  const renderList = async (
    sets: PracticeSetSummaryResponse[] | null,
    pools?: Map<string, PracticePoolResponse>
  ) => {
    const { PracticeListPage } = await import(
      "~/features/practice/components/practice-list-page"
    );
    return renderToStaticMarkup(await PracticeListPage({ sets, pools }));
  };

  const pool = (over: Partial<PracticePoolResponse> = {}) =>
    new Map([
      [
        "c1",
        {
          courseId: "c1",
          questionCount: 120,
          openAttemptId: null,
          attempts: [],
          ...over,
        },
      ],
    ]);

  it("offers the course's pool: all of it, or some at random", async () => {
    const html = await renderList([set({ id: "a" })], pool());
    expect(html).toContain('data-testid="practice-pool"');
    expect(html).toContain('href="/calisma-sorulari/havuz/c1?mod=ALL"');
    expect(html).toContain(">Tüm soruları çöz (120)<");
    expect(html).toContain('action="/calisma-sorulari/havuz/c1"');
    expect(html).toContain('name="mod" value="RANDOM"');
    expect(html).toMatch(/name="sayi"[^>]*/);
    expect(html).toContain('value="50"');
    expect(html).toContain('max="120"');
    expect(html).toContain(">Rastgele soru çöz<");
    expect(html).not.toContain("Karışık denemeye devam et");
  });

  it("goes on with an open pool attempt, and shows no pool when it is empty", async () => {
    const open = await renderList(
      [set({ id: "a" })],
      pool({ openAttemptId: "p1" })
    );
    expect(open).toContain(">Karışık denemeye devam et<");
    expect(open).toContain('href="/calisma-sorulari/havuz/c1"');
    expect(open).not.toContain("Rastgele soru çöz");
    const empty = await renderList(
      [set({ id: "a" })],
      pool({ questionCount: 0 })
    );
    expect(empty).not.toContain('data-testid="practice-pool"');
  });

  it("lists the sets by course with their counts and the last result", async () => {
    const html = await renderList([
      set({ id: "a" }),
      set({ id: "b", attemptCount: 2, lastPercent: "75.00" }),
      set({ id: "c", openAttemptId: "x", attemptCount: 1 }),
    ]);
    expect(html).toContain('id="ders-c1"');
    expect(html).toContain(">Emsile<");
    // The course heading counts the sets its rows call "Çözüldü"; one being
    // solved again is "Devam ediyor", not solved.
    expect(html).toContain("3 set · 1 çözüldü");
    // One table, a row per set, each with its state in words.
    expect(html.match(/<table/g)).toHaveLength(1);
    expect(html.match(/data-testid="practice-set"/g)).toHaveLength(3);
    expect(html).toMatch(/data-action="start".*?>Yeni</);
    expect(html).toMatch(/data-action="again".*?>Çözüldü</);
    expect(html).toMatch(/data-action="continue".*?>Devam ediyor</);
    expect(html).toMatch(/data-testid="practice-set-last"[^>]*><strong>%75</);
    // The phone's line in place of the number cells, for the eye only.
    expect(html).toContain("10 soru · 2 deneme · Son sonucun: %75");
    expect(html).toMatch(/data-testid="practice-set-facts" aria-hidden="true"/);
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
    expect(html).toContain("%33");
    expect(html).not.toContain("%33,33");
    expect(html).toMatch(/data-testid="practice-correct">1</);
    expect(html).toMatch(/data-testid="practice-wrong">1</);
    expect(html).toMatch(/data-testid="practice-blank">1</);
    // The wrong one: the choice in the error colour with its cross, the
    // correct option in success with its tick; a right choice stays info.
    expect(html).toContain('data-outcome="wrong"');
    expect(html).toMatch(
      /data-chosen="true"[^>]*>(?:(?!<\/li>).)*?İkinci bab(?:(?!<\/li>).)*?mds-badge--error(?:(?!<\/li>).)*?<svg(?:(?!<\/li>).)*?Senin seçimin/
    );
    expect(html).toMatch(
      /data-correct="true"[^>]*>(?:(?!<\/li>).)*?Birinci bab(?:(?!<\/li>).)*?mds-badge--success(?:(?!<\/li>).)*?<svg(?:(?!<\/li>).)*?Doğru şık/
    );
    expect(html).toMatch(
      /data-chosen="true" data-correct="true"[^>]*>(?:(?!<\/li>).)*?mds-badge--info[^>]*>Senin seçimin/
    );
    // Every question as a card in the grid, a tile each on the strip, and a
    // filter by outcome with the counts.
    expect(html.match(/data-testid="practice-answer"/g)).toHaveLength(3);
    expect(html).toContain('data-testid="answer-grid"');
    expect(html).toContain('aria-label="1. soru: Yanlış"');
    expect(html).toContain('aria-label="2. soru: Doğru"');
    expect(html).toContain('aria-label="3. soru: Boş"');
    // A card lists only the choice and the correct option.
    expect(html).not.toContain("Dördüncü bab");
    expect(html).toContain("Tümü (3)");
    expect(html).toContain("Doğru (1)");
    expect(html).toContain("Yanlış (1)");
    expect(html).toContain("Boş (1)");
    // One set: no "Set: …" under each question.
    expect(html).not.toContain('data-testid="practice-answer-set"');
    expect(html).toContain("Bu soruyu boş bıraktın.");
    expect(html).toContain('href="/calisma-sorulari/s1"');
    expect(html).toContain(">Tekrar çöz<");
    expect(html).toContain(">Çalışma sorularına dön<");
  });

  it("names each question's set, and calls a pool attempt a mixed one", async () => {
    const html = await renderResult({
      ...finished,
      setId: null,
      poolMode: "RANDOM",
      title: "",
    });
    expect(html).toContain(">Karışık deneme<");
    expect(html).toMatch(
      /data-testid="practice-answer-set"[^>]*>Set: <span dir="auto">Birinci bab</
    );
    expect(html).toContain('href="/calisma-sorulari#ders-c1"');
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
