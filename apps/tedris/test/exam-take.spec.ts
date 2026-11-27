// @vitest-environment happy-dom
import type {
  ExamAttemptResponse,
  ExamBriefingResponse,
} from "@medaris/services/tedrisat";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, key, render, settle } from "./dom";

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
// The note icon's Server Actions (soru notları), never called here.
vi.mock("~/features/question-notes/actions", () => ({
  saveMyQuestionNote: vi.fn(),
  deleteMyQuestionNote: vi.fn(),
}));

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
/** An option's card, the <label>, found by the option's text (its letter aside). */
const card = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll("label")].find(
    (l) =>
      (l.querySelector(".mds-choice__label") ?? l).textContent?.trim() === label
  ) as HTMLLabelElement | undefined;
const radio = (host: HTMLElement, label: string) =>
  card(host, label)?.querySelector("[role=radio]") as HTMLElement;

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
    // The latest answer is held: the page says so (MDRS-299).
    expect(host.textContent).toContain("Cevabın kaydedildi.");
    // The points in Turkish numbers, with two decimals.
    expect(host.textContent).toContain("50,00 puan");
    expect(host.textContent).not.toContain("50.00");
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

  it("asks the server for the clock every 10 seconds while the countdown runs (EXM-TAKE-15)", async () => {
    // Only the intervals are fake: `settle` waits on real time. The toaster
    // and the translations mocked above are new on every render, as the
    // toaster once was in the app, so the clock must not restart with them.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      mocks.startExamAttempt.mockResolvedValue(ok(attempt()));
      let server = 1800;
      mocks.tickExamClock.mockImplementation(async () => {
        server -= 10;
        return ok({ secondsLeft: server, status: "IN_PROGRESS" });
      });
      const host = await mount(briefing());
      await click(button(host, "Sınava başla"));
      await settle();
      // One second at a time, so the countdown renders between them.
      for (let second = 1; second <= 30; second += 1) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1000);
        });
        if (second === 9) expect(mocks.tickExamClock).not.toHaveBeenCalled();
        if (second === 10) expect(mocks.tickExamClock).toHaveBeenCalledTimes(1);
      }
      expect(mocks.tickExamClock).toHaveBeenCalledTimes(3);
      expect(mocks.tickExamClock).toHaveBeenLastCalledWith(
        "l1",
        expect.any(String)
      );
      // The server's word stands: 1770 seconds left.
      expect(host.querySelector("[role=timer]")?.textContent).toContain(
        "29:30"
      );
    } finally {
      vi.useRealTimers();
    }
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

  it("keeps Bitir in the bar, leads with Sonraki under the options, Bitir at the end, and takes the keys", async () => {
    mocks.startExamAttempt.mockResolvedValue(ok(attempt()));
    mocks.saveExamAnswer.mockResolvedValue(
      ok({ written: true, secondsLeft: 1700 })
    );
    const host = await mount(briefing());
    // Nothing is picked by a key on the briefing.
    await key(document.body, "1");
    await click(button(host, "Sınava başla"));
    await settle();
    expect(mocks.saveExamAnswer).not.toHaveBeenCalled();
    const bar = host.querySelector("[data-testid=exam-clock]")
      ?.parentElement as HTMLElement;
    expect(
      bar.querySelector("[data-testid=finish-in-bar]")?.className
    ).toContain("mds-btn--secondary");
    const nav = host.querySelector("[data-testid=take-nav]") as HTMLElement;
    const lead = nav.querySelector(".take-nav__go") as HTMLButtonElement;
    expect(lead.textContent).toBe("Sonraki");
    expect(lead.className).toContain("mds-btn--primary");
    expect(
      card(host, "Be")?.querySelector(".take-option__letter")?.textContent
    ).toBe("B");
    await key(document.body, "b");
    await settle();
    expect(radio(host, "Be").getAttribute("aria-checked")).toBe("true");
    expect(mocks.saveExamAnswer).toHaveBeenLastCalledWith(
      "l1",
      "q1",
      expect.objectContaining({ optionIds: ["b"] })
    );
    await key(document.body, "Enter");
    await settle();
    expect(host.textContent).toContain("İkinci soru");
    expect(lead.textContent).toBe("Sınavı bitir");
    await key(document.body, "Enter");
    await settle();
    expect(document.querySelector("[role=alertdialog]")).toBeTruthy();
    // The dialog keeps its keys: a digit picks nothing under it.
    await key(document.querySelector("[role=alertdialog]") as Element, "1");
    await settle();
    expect(radio(host, "Cim").getAttribute("aria-checked")).toBe("false");
  });

  it("lays the exam out for a desk like the çalışma soruları: panes and the list behind Sorular (tek ekran)", async () => {
    mocks.startExamAttempt.mockResolvedValue(ok(attempt()));
    const host = await mount(briefing());
    await click(button(host, "Sınava başla"));
    await settle();
    const screen = host.querySelector("[data-take-screen]") as HTMLElement;
    expect(screen.className).toContain("take-column");
    const bar = host.querySelector("[data-testid=exam-clock]")
      ?.parentElement as HTMLElement;
    expect(bar.className).toContain("take-bar");
    const body = host
      .querySelector("#exam-question")
      ?.closest("section.take-body") as HTMLElement;
    expect(body).toBeTruthy();
    expect(
      body.querySelector(".take-question-pane #exam-question")
    ).toBeTruthy();
    expect(body.querySelector(".take-options-pane .take-options")).toBeTruthy();
    expect(body.querySelector("[data-testid=take-nav]")).toBeTruthy();
    const toggle = bar.querySelector(
      "[data-testid=take-list-toggle]"
    ) as HTMLButtonElement;
    const list = host.querySelector("nav.take-navigator") as HTMLElement;
    expect(toggle.getAttribute("aria-controls")).toBe(list.id);
    await click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await key(document.body, "Escape");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
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
    // The buttons now sit once in the exam's top bar, and the sentence says so.
    expect(sample.closest("li")?.textContent).toContain("üst çubuktaki");
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
    // A− / A+ once, in the bar beside the timer, not on the question.
    const sizes = host.querySelectorAll("[data-testid=text-size]");
    expect(sizes).toHaveLength(1);
    expect(
      sizes[0].closest("section")?.querySelector("[data-testid=exam-clock]")
    ).toBeTruthy();
    expect(sizes[0].closest("[aria-labelledby=exam-question]")).toBeNull();
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

describe("a question's points (MDRS-299)", () => {
  it("are written in the locale's numbers with two decimals", async () => {
    const { pointsText } = await import("~/features/online-exams/take-model");
    expect(pointsText("25.00", "tr")).toBe("25,00");
    expect(pointsText("33.33", "tr")).toBe("33,33");
    expect(pointsText("2", "tr")).toBe("2,00");
    expect(pointsText("25.00", "en")).toBe("25.00");
  });
});
