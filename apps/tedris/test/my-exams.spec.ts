import { resources } from "@medaris/i18n";
import type {
  MyExamResponse,
  MyExamResultResponse,
} from "@medaris/services/tedrisat";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  actionOf,
  groupExams,
  scoreText,
} from "~/features/online-exams/my-exams-model";

/**
 * Sınavlarım and a talebe's own screen of a past exam (MDRS-299,
 * `graphs/tedris/exams/mine` and `result`), rendered with the real Turkish
 * catalogue: nothing scored before the release, the correct options only
 * once the exam has closed for everyone.
 */

const text = (key: string) =>
  key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown>)?.[part],
      resources.tr.tedrisLearn.MyExams
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

const exam = (over: Partial<MyExamResponse>): MyExamResponse =>
  ({
    lessonId: "l1",
    courseId: "c1",
    courseTitle: "Fıkıh Usulü",
    title: "Ara sınav",
    format: "MULTIPLE_CHOICE",
    startsAt: new Date("2026-11-28T17:00:00Z"),
    latestStartAt: new Date("2026-11-28T17:10:00Z"),
    state: "OPEN",
    score: null,
    maxScore: 100,
    durationMinutes: 60,
    questionCount: 50,
    place: null,
    ...over,
  }) as MyExamResponse;

const renderList = async (exams: MyExamResponse[] | null) => {
  const { MyExamsPage } = await import(
    "~/features/online-exams/components/my-exams-page"
  );
  return renderToStaticMarkup(await MyExamsPage({ exams }));
};

const released: MyExamResultResponse = {
  lessonId: "l1",
  courseId: "c1",
  courseTitle: "Fıkıh Usulü",
  title: "Ara sınav",
  status: "FINISHED",
  startedAt: new Date("2026-11-28T17:02:00Z"),
  finishedAt: new Date("2026-11-28T17:50:00Z"),
  finishedBy: "TALEBE",
  released: true,
  closed: false,
  score: "62.50",
  counts: { right: 5, wrong: 2, blank: 1 },
  standing: { taken: 12, rank: 3, tiedWith: 0 },
  topics: [
    {
      topicId: "t2",
      number: 2,
      name: "İcma",
      percent: 25,
      right: 1,
      wrong: 2,
      blank: 1,
      standing: { taken: 12, rank: 7, tiedWith: 2 },
    },
    {
      topicId: "t1",
      number: 1,
      name: "Kıyas",
      percent: 80,
      right: 4,
      wrong: 1,
      blank: 0,
      standing: { taken: 12, rank: 1, tiedWith: 0 },
    },
  ],
  courseTopics: [
    { topicId: "t2", number: 2, name: "İcma", percent: 30, exams: 2 },
  ],
  questions: null,
} as unknown as MyExamResultResponse;

const renderResult = async (result: MyExamResultResponse) => {
  const { MyExamResult } = await import(
    "~/features/online-exams/components/my-exam-result"
  );
  return renderToStaticMarkup(
    await MyExamResult({ read: { status: "ok", result } })
  );
};

describe("Sınavlarım (MDRS-299)", () => {
  it("groups open, coming and past, and leads each where it belongs", () => {
    const listed = [
      exam({ lessonId: "a", state: "IN_PROGRESS" }),
      exam({ lessonId: "b", state: "UPCOMING" }),
      exam({ lessonId: "c", state: "RELEASED", score: "85.50" }),
      exam({ lessonId: "d", format: "WRITTEN", state: "TAKEN" }),
    ];
    expect(
      groupExams(listed).map((g) => [g.group, g.exams.map((e) => e.lessonId)])
    ).toEqual([
      ["open", ["a"]],
      ["coming", ["b"]],
      ["past", ["c", "d"]],
    ]);
    expect(actionOf(listed[0])).toEqual({
      kind: "continue",
      href: "/courses/c1/lessons/a/sinav",
    });
    // To come, open or in progress: straight to the exam's own page.
    expect(actionOf(listed[1])).toEqual({
      kind: "view",
      href: "/courses/c1/lessons/b/sinav",
    });
    expect(actionOf(exam({ lessonId: "o", state: "OPEN" }))).toEqual({
      kind: "enter",
      href: "/courses/c1/lessons/o/sinav",
    });
    // A written exam to come has no page of its own to go to.
    expect(actionOf(exam({ format: "WRITTEN", state: "UPCOMING" }))).toBeNull();
    expect(actionOf(listed[2])).toEqual({
      kind: "result",
      href: "/my-exams/c",
    });
    expect(actionOf(listed[3])).toEqual({
      kind: "grades",
      href: "/courses/c1?tab=notlarim",
    });
    expect(actionOf(exam({ state: "MISSED" }))).toBeNull();
    expect(scoreText("85.50", "tr")).toBe("85,50");
    expect(scoreText("85.00", "tr")).toBe("85");
    expect(scoreText("17", "tr")).toBe("17");
  });

  it("draws the groups with each exam's standing, and a score only once released", async () => {
    const html = await renderList([
      exam({ lessonId: "a", state: "OPEN" }),
      exam({ lessonId: "b", state: "TAKEN", title: "Final" }),
      exam({
        lessonId: "c",
        format: "ORAL",
        title: "Şifahi sınav",
        state: "RELEASED",
        score: "17",
        maxScore: 20,
        latestStartAt: null,
        durationMinutes: null,
        questionCount: null,
        place: "Büyük salon",
      }),
    ]);
    expect(html).toContain("Şimdi açık");
    expect(html).toContain("Geçmiş");
    expect(html).not.toContain("Yaklaşan");
    expect(html).toContain("60 dakika · 50 soru");
    expect(html).toContain('aria-label="Sınava gir: Fıkıh Usulü, Ara sınav"');
    expect(html).toContain('href="/courses/c1/lessons/a/sinav"');
    expect(html).toContain("Sonuç henüz açıklanmadı");
    expect(html).toContain('href="/my-exams/b"');
    expect(html).toContain("Şifahi");
    expect(html).toContain("17 / 20");
    expect(html).toContain("Yer: Büyük salon");
    expect(html).toContain('href="/courses/c1?tab=notlarim"');
  });

  it("says when the list is empty, and when it could not be read", async () => {
    expect(await renderList([])).toContain("Henüz sınavın yok.");
    const failed = await renderList(null);
    expect(failed).toContain("Sınavlar okunamadı");
    expect(failed).not.toContain("Henüz sınavın yok.");
  });
});

describe("a talebe's screen of a past exam (MDRS-299)", () => {
  it("before the release says only that it was handed in", async () => {
    const html = await renderResult({
      ...released,
      released: false,
      score: null,
      counts: null,
      standing: null,
      topics: [],
      courseTopics: [],
    });
    expect(html).toContain("teslim ettin");
    expect(html).not.toContain("sıradasın");
    expect(html).toContain("Sonuç henüz açıklanmadı");
    expect(html).not.toContain("100 üzerinden");
    expect(html).not.toContain("Cevaplarım");
  });

  it("after the release shows the score, the counts and the topics, the weakest first", async () => {
    const html = await renderResult(released);
    expect(html).toContain("100 üzerinden 62,50");
    expect(html).toContain("5 doğru · 2 yanlış · 1 boş");
    expect(html.indexOf("2. İcma")).toBeLessThan(html.indexOf("1. Kıyas"));
    expect(html).toContain('aria-label="2. İcma: yüzde 25"');
    expect(html).toContain("Dersin konularında durumum");
    expect(html).toContain("Yüzde 30 · 2 sınavdan");
    // The answers wait for the exam to close for everyone.
    expect(html).toContain("sınav herkes için bitince");
  });

  it("says how many took the exam and where the talebe stands, and who shares the rank, in the exam and each topic", async () => {
    const html = await renderResult(released);
    expect(html).toContain(
      "Sınava 12 kişi girdi. Puanın 62,50. 12 kişi içinde 3. sıradasın."
    );
    // İcma: a tie; Kıyas: first, alone.
    expect(html).toContain(
      "12 kişi içinde 7. sıradasın; 2 kişi seninle aynı puanı aldı."
    );
    expect(html).toContain("12 kişi içinde 1. sıradasın.");
    const tied = await renderResult({
      ...released,
      standing: { taken: 12, rank: 3, tiedWith: 1 },
    } as MyExamResultResponse);
    expect(tied).toContain(
      "12 kişi içinde 3. sıradasın; 1 kişi seninle aynı puanı aldı."
    );
  });

  it("once closed for everyone opens the answers with the correct options", async () => {
    const html = await renderResult({
      ...released,
      closed: true,
      questions: [
        {
          id: "q1",
          number: 1,
          text: "Kıyasın rükünleri kaç tanedir?",
          outcome: "WRONG",
          points: "50.00",
          got: "0.00",
          options: [
            { id: "o1", text: "Üç", chosen: true, correct: false },
            { id: "o2", text: "Dört", chosen: false, correct: true },
          ],
        },
      ],
    } as unknown as MyExamResultResponse);
    expect(html).toContain("1. soru");
    expect(html).toContain("Yanlış");
    expect(html).toContain("0 / 50 puan");
    expect(html).toMatch(/data-chosen="true"[^>]*>.*?Üç/);
    expect(html).toMatch(/data-correct="true"[^>]*>.*?Dört/);
  });

  it("an exam still in progress leads back to it", async () => {
    const html = await renderResult({
      ...released,
      status: "IN_PROGRESS",
      finishedAt: null,
      finishedBy: null,
      released: false,
    } as unknown as MyExamResultResponse);
    expect(html).toContain("Sınavın sürüyor");
    expect(html).toContain('href="/courses/c1/lessons/l1/sinav"');
  });
});
