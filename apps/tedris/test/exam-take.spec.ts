// @vitest-environment happy-dom
import type {
  ExamAttemptResponse,
  ExamBriefingResponse,
} from "@medaris/services/tedrisat";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, render, settle } from "./dom";

/**
 * The exam page of tedris (MDRS-299, `graphs/tedris/exams/take`): a choice
 * shows the moment it is made and is sent in the background with the page's
 * count, so an earlier save that answers late never takes it back; another
 * tab that opens the exam takes it; and the end of the time ends it.
 */

const mocks = vi.hoisted(() => ({
  readExamBriefing: vi.fn(),
  answerZerothQuestion: vi.fn(),
  startExamAttempt: vi.fn(),
  resumeExamAttempt: vi.fn(),
  saveExamAnswer: vi.fn(),
  tickExamClock: vi.fn(),
  recordTabSwitch: vi.fn(),
  finishExamAttempt: vi.fn(),
}));

vi.mock("next-intl", async () => {
  const { resources } = await import("@medaris/i18n");
  return {
    useLocale: () => "tr",
    useTranslations: (namespace: string) => {
      const read = (key: string) =>
        [...namespace.split("."), ...key.split(".")].reduce<unknown>(
          (node, part) => (node as Record<string, unknown>)?.[part],
          resources.tr
        ) as string;
      return (key: string, values?: Record<string, string | number>) =>
        read(key).replace(/\{(\w+)\}/g, (_, name) =>
          String(values?.[name] ?? "")
        );
    },
  };
});
vi.mock("@medaris/ui/mds/toast", () => ({
  useToaster: () => ({ notify: () => "", dismiss: () => {} }),
}));
vi.mock("~/lib/send-to-sign-in", () => ({ sendToSignIn: () => false }));
vi.mock("~/features/online-exams/actions", () => mocks);

const ok = <T>(data: T) => ({ success: true as const, data });

/** Answers the test lets through when it wants. */
const held: Array<() => void> = [];
const later = <T>(value: T) =>
  new Promise<T>((resolve) => held.push(() => resolve(value)));

const briefing = (
  over: Partial<ExamBriefingResponse> = {}
): ExamBriefingResponse =>
  ({
    lessonId: "l1",
    courseId: "c1",
    title: "Ara sınav",
    courseTitle: "Emsile ve Bina",
    durationMinutes: 30,
    questionCount: 2,
    startsAt: new Date("2026-12-01T09:00:00Z"),
    latestStartAt: new Date("2026-12-01T09:10:00Z"),
    instructions: null,
    window: "OPEN",
    zeroth: {
      question: "Bu hadisi ne zaman öğrendin?",
      options: [{ id: "z1", text: "Bu dönem" }],
      answeredOptionId: "z1",
    },
    attempt: null,
    ...over,
  }) as ExamBriefingResponse;

const attempt = (secondsLeft = 1800): ExamAttemptResponse =>
  ({
    status: "IN_PROGRESS",
    secondsLeft,
    switches: 0,
    currentQuestionId: null,
    startedAt: new Date(),
    finishedAt: null,
    finishedBy: null,
    questions: [
      {
        id: "q1",
        number: 1,
        text: "Birinci soru",
        answerMode: "SINGLE",
        points: "50.00",
        options: [
          { id: "a", text: "Elif" },
          { id: "b", text: "Be" },
        ],
      },
      {
        id: "q2",
        number: 2,
        text: "İkinci soru",
        answerMode: "SINGLE",
        points: "50.00",
        options: [
          { id: "c", text: "Cim" },
          { id: "d", text: "Dal" },
        ],
      },
    ],
    answers: [],
  }) as ExamAttemptResponse;

const button = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement;
const radio = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll("label")]
    .find((l) => l.textContent?.trim() === label)
    ?.querySelector("[role=radio]") as HTMLElement;

const mount = async (b: ExamBriefingResponse) => {
  const { ExamTake } = await import(
    "~/features/online-exams/components/exam-take"
  );
  const host = await render(
    createElement(ExamTake, {
      lessonId: "l1",
      sessionHref: "/courses/c1/lessons/l1",
      briefing: b,
    })
  );
  await settle();
  return host;
};

beforeEach(() => {
  window.sessionStorage.clear();
  for (const m of Object.values(mocks)) m.mockReset();
  held.length = 0;
  mocks.tickExamClock.mockResolvedValue(
    ok({ secondsLeft: 1800, status: "IN_PROGRESS" })
  );
});
afterEach(cleanup);

describe("the exam page (MDRS-299)", () => {
  it("shows a choice at once, and a late answer to an earlier save does not take it back", async () => {
    mocks.startExamAttempt.mockResolvedValue(ok(attempt()));
    mocks.saveExamAnswer.mockImplementation(
      (_lesson, questionId, body: { seq: number; optionIds: string[] }) =>
        later(
          ok({
            questionId,
            optionIds: body.optionIds,
            skipped: false,
            written: true,
            secondsLeft: 1790,
          })
        )
    );
    const host = await mount(briefing());
    await click(button(host, "Sınava başla"));
    await settle();
    expect(host.textContent).toContain("Birinci soru");

    await click(radio(host, "Elif"));
    // Chosen before the server has answered.
    expect(radio(host, "Elif").getAttribute("aria-checked")).toBe("true");
    expect(host.textContent).toContain("Kaydediliyor…");
    await click(radio(host, "Be"));
    expect(radio(host, "Be").getAttribute("aria-checked")).toBe("true");

    expect(
      mocks.saveExamAnswer.mock.calls.map((c) => [c[2].seq, c[2].optionIds])
    ).toEqual([
      [1, ["a"]],
      [2, ["b"]],
    ]);
    // The second answers first, then the first arrives late.
    held[1]?.();
    await settle();
    held[0]?.();
    await settle();
    expect(radio(host, "Be").getAttribute("aria-checked")).toBe("true");
    expect(radio(host, "Elif").getAttribute("aria-checked")).toBe("false");
    expect(host.textContent).not.toContain("Kaydediliyor…");
  });

  it("asks for the zeroth answer before the start", async () => {
    mocks.answerZerothQuestion.mockReturnValue(later(ok({ optionId: "z1" })));
    const host = await mount(
      briefing({
        zeroth: {
          question: "Bu hadisi ne zaman öğrendin?",
          options: [{ id: "z1", text: "Bu dönem" }],
          answeredOptionId: null,
        },
      })
    );
    expect(button(host, "Sınava başla").disabled).toBe(true);
    expect(host.textContent).toContain("مَنْ غَشَّنَا فَلَيْسَ مِنَّا");
    await click(radio(host, "Bu dönem"));
    // At once, while the save is on its way.
    expect(button(host, "Sınava başla").disabled).toBe(false);
    expect(mocks.answerZerothQuestion).toHaveBeenCalledWith("l1", "z1");
  });

  it("says the exam is open elsewhere when another tab has taken it", async () => {
    mocks.startExamAttempt.mockResolvedValue(ok(attempt()));
    mocks.saveExamAnswer.mockResolvedValue({
      success: false,
      error: "held",
      status: 409,
      code: "ATTEMPT_HELD_ELSEWHERE",
    });
    const host = await mount(briefing());
    await click(button(host, "Sınava başla"));
    await settle();
    await click(radio(host, "Elif"));
    await settle();
    expect(host.textContent).toContain("Sınav başka bir yerde açık");
    expect(button(host, "Burada aç")).toBeTruthy();
  });

  it("says Medaris was updated when a save names a gone Server Action, and keeps the choice for the reload", async () => {
    const { UnrecognizedActionError } = await import(
      "next/dist/client/components/unrecognized-action-error"
    );
    mocks.startExamAttempt.mockResolvedValue(ok(attempt()));
    mocks.saveExamAnswer.mockRejectedValue(
      new UnrecognizedActionError("Server Action was not found")
    );
    const host = await mount(briefing());
    await click(button(host, "Sınava başla"));
    await settle();
    await click(radio(host, "Elif"));
    await settle();
    expect(host.textContent).toContain("Medaris güncellendi");
    expect(button(host, "Sayfayı yenile")).toBeTruthy();
    const kept = JSON.parse(
      window.sessionStorage.getItem("exam-unsent:l1") ?? "[]"
    );
    expect(kept).toEqual([["q1", { optionIds: ["a"], skipped: false }]]);
  });

  it("sends the choices kept before a reload once the attempt is taken back", async () => {
    window.sessionStorage.setItem(
      "exam-unsent:l1",
      JSON.stringify([["q2", { optionIds: ["d"], skipped: false }]])
    );
    mocks.resumeExamAttempt.mockResolvedValue(ok(attempt()));
    mocks.saveExamAnswer.mockResolvedValue(
      ok({ written: true, secondsLeft: 1700 })
    );
    await mount(
      briefing({
        attempt: { status: "IN_PROGRESS", finishedAt: null, finishedBy: null },
      } as Partial<ExamBriefingResponse>)
    );
    await settle();
    expect(mocks.saveExamAnswer).toHaveBeenCalledWith(
      "l1",
      "q2",
      expect.objectContaining({ optionIds: ["d"], seq: 1 })
    );
    expect(window.sessionStorage.getItem("exam-unsent:l1")).toBeNull();
  });

  it("ends the exam when the time runs out, with the answers saved", async () => {
    mocks.startExamAttempt.mockResolvedValue(ok(attempt(1)));
    mocks.tickExamClock.mockResolvedValue(
      ok({ secondsLeft: 0, status: "FINISHED" })
    );
    mocks.readExamBriefing.mockResolvedValue(
      ok(
        briefing({
          attempt: {
            status: "FINISHED",
            finishedAt: new Date("2026-12-01T09:40:00Z"),
            finishedBy: "TIME",
          },
        } as Partial<ExamBriefingResponse>)
      )
    );
    const host = await mount(briefing());
    await click(button(host, "Sınava başla"));
    await settle();
    expect(host.querySelector("[role=timer]")?.textContent).toContain("0:01");
    expect(host.textContent).toContain("Son 5 dakika");
    await settle(1300);
    await settle();
    expect(mocks.tickExamClock).toHaveBeenCalled();
    expect(host.querySelector("[data-testid=exam-ended]")).toBeTruthy();
    expect(host.textContent).toContain("Süre doldu");
  });

  it("goes on with an attempt in progress where the talebe was", async () => {
    mocks.resumeExamAttempt.mockResolvedValue(
      ok({
        ...attempt(),
        currentQuestionId: "q2",
        answers: [{ questionId: "q1", optionIds: ["b"], skipped: false }],
      })
    );
    const host = await mount(
      briefing({
        attempt: { status: "IN_PROGRESS", finishedAt: null, finishedBy: null },
      } as Partial<ExamBriefingResponse>)
    );
    await settle();
    expect(host.textContent).toContain("İkinci soru");
    expect(host.textContent).toContain("Sınav kaldığın yerden devam ediyor.");
    const list = host.querySelector("nav") as HTMLElement;
    expect(
      list.querySelector("[aria-label='1. soru, Cevaplandı']")
    ).toBeTruthy();
  });

  /** A running attempt, and a clock the test moves. */
  const running = async () => {
    mocks.resumeExamAttempt.mockResolvedValue(ok(attempt()));
    mocks.recordTabSwitch.mockResolvedValue(ok({ switches: 1 }));
    await mount(
      briefing({
        attempt: { status: "IN_PROGRESS", finishedAt: null, finishedBy: null },
      } as Partial<ExamBriefingResponse>)
    );
    await settle();
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    let focused = true;
    vi.spyOn(document, "hasFocus").mockImplementation(() => focused);
    let visibility: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
    return {
      later: (ms: number) => {
        now += ms;
      },
      leaveWindow: () => {
        focused = false;
        window.dispatchEvent(new Event("blur"));
      },
      backToWindow: async () => {
        focused = true;
        window.dispatchEvent(new Event("focus"));
        await settle();
      },
      hide: () => {
        focused = false;
        visibility = "hidden";
        document.dispatchEvent(new Event("visibilitychange"));
      },
      show: async () => {
        visibility = "visible";
        document.dispatchEvent(new Event("visibilitychange"));
        focused = true;
        window.dispatchEvent(new Event("focus"));
        await settle();
      },
    };
  };

  it("counts going to another window, not only another tab", async () => {
    const page = await running();
    page.leaveWindow();
    page.later(5000);
    await page.backToWindow();
    expect(mocks.recordTabSwitch).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it("counts a hidden tab once, though both the tab and the window come back", async () => {
    const page = await running();
    page.hide();
    page.later(5000);
    await page.show();
    expect(mocks.recordTabSwitch).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it("does not count leaving the page for less than two seconds", async () => {
    const page = await running();
    page.leaveWindow();
    page.later(800);
    await page.backToWindow();
    expect(mocks.recordTabSwitch).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("colours the question list: unanswered plain, answered blue, skipped dark yellow, the current one ringed", async () => {
    const three = attempt();
    three.questions = [
      ...three.questions,
      {
        id: "q3",
        number: 3,
        text: "Üçüncü soru",
        answerMode: "SINGLE",
        points: "33.33",
        options: [
          { id: "e", text: "Ra" },
          { id: "f", text: "Ze" },
        ],
      },
    ] as typeof three.questions;
    mocks.resumeExamAttempt.mockResolvedValue(
      ok({
        ...three,
        currentQuestionId: "q2",
        answers: [
          { questionId: "q1", optionIds: ["b"], skipped: false },
          { questionId: "q2", optionIds: [], skipped: true },
        ],
      })
    );
    const host = await mount(
      briefing({
        questionCount: 3,
        attempt: { status: "IN_PROGRESS", finishedAt: null, finishedBy: null },
      } as Partial<ExamBriefingResponse>)
    );
    await settle();
    const list = host.querySelector("nav") as HTMLElement;
    const item = (name: string) =>
      list.querySelector(`[aria-label='${name}']`) as HTMLElement;
    const answered = item("1. soru, Cevaplandı");
    const skipped = item("2. soru, Atlandı");
    const unanswered = item("3. soru, Cevaplanmadı");
    expect(answered.style.background).toBe("var(--background-info-bold)");
    expect(skipped.style.background).toBe("var(--background-warning-bold)");
    expect(unanswered.style.background).toBe(
      "var(--background-neutral-surface)"
    );
    // The current question keeps its colour, with a ring on top.
    expect(skipped.getAttribute("aria-current")).toBe("step");
    expect(skipped.style.boxShadow).toContain("var(--border-brand-default)");
    expect(answered.style.boxShadow).toBe("");
  });

  it("takes back the choice when an answered question is skipped", async () => {
    mocks.startExamAttempt.mockResolvedValue(ok(attempt()));
    mocks.saveExamAnswer.mockResolvedValue(
      ok({ written: true, secondsLeft: 1700 })
    );
    const host = await mount(briefing());
    await click(button(host, "Sınava başla"));
    await settle();
    await click(radio(host, "Elif"));
    await settle();
    await click(button(host, "Önceki"));
    await settle();
    await click(button(host, "Soruyu atla"));
    await settle();
    expect(mocks.saveExamAnswer).toHaveBeenLastCalledWith(
      "l1",
      "q1",
      expect.objectContaining({ optionIds: [], skipped: true })
    );
    const list = host.querySelector("nav") as HTMLElement;
    expect(list.querySelector("[aria-label='1. soru, Atlandı']")).toBeTruthy();
  });

  it("names the list's colours among what to know before the start", async () => {
    const host = await mount(briefing());
    expect(host.textContent).toContain(
      "cevaplamadığın sorular düz, cevapladıkların mavi, atladıkların koyu sarı"
    );
  });
  it("says in the briefing what A− and A+ do, and draws them", async () => {
    const host = await mount(briefing());
    const sample = host.querySelector(
      "[data-testid=text-size-sample]"
    ) as HTMLElement;
    expect(sample.getAttribute("aria-hidden")).toBe("true");
    expect(sample.textContent).toBe("A−A+");
    expect(sample.querySelector("button")).toBeNull();
    expect(sample.closest("li")?.textContent).toContain(
      "Soruların yazısını büyütüp küçültebilirsin"
    );
  });

  it("zooms the whole exam step by step, spans the screen at the largest, and keeps it for a reload", async () => {
    const arabic = attempt();
    arabic.questions[0].options = [
      { id: "a", text: "زَيْدٌ فِي الدَّارِ" },
      { id: "b", text: "Be" },
    ];
    mocks.startExamAttempt.mockResolvedValue(ok(arabic));
    const host = await mount(briefing());
    await click(button(host, "Sınava başla"));
    await settle();
    const card = () => host.querySelector("[data-text-scale]") as HTMLElement;
    expect(card().dataset.textScale).toBe("1");
    // The timer, the question and the list are all inside the zoomed area.
    expect(card().querySelector("[data-testid=exam-clock]")).toBeTruthy();
    expect(card().querySelector("nav")).toBeTruthy();
    expect(card().parentElement?.style.maxInlineSize).not.toBe("none");
    expect(button(host, "A−").disabled).toBe(true);
    for (let i = 0; i < 3; i++) await click(button(host, "A+"));
    expect(card().dataset.textScale).toBe("1.5");
    expect(button(host, "A+").disabled).toBe(true);
    // The whole exam is zoomed, and at the largest step it spans the screen.
    expect(card().style.zoom).toBe("1.5");
    expect(card().parentElement?.style.maxInlineSize).toBe("none");
    expect(window.sessionStorage.getItem("exam-text-scale:l1")).toBe("3");
    // An Arabic option is its own Arabic run.
    const run = [...host.querySelectorAll("[lang=ar]")].find(
      (el) => el.textContent === "زَيْدٌ فِي الدَّارِ"
    ) as HTMLElement;
    expect(run.getAttribute("dir")).toBe("rtl");

    await cleanup();
    mocks.startExamAttempt.mockResolvedValue(ok(attempt()));
    const again = await mount(briefing());
    await click(button(again, "Sınava başla"));
    await settle();
    expect(
      (again.querySelector("[data-text-scale]") as HTMLElement).dataset
        .textScale
    ).toBe("1.5");
  });
});
