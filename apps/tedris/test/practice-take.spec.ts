// @vitest-environment happy-dom
import type { PracticeAttemptResponse } from "@medaris/services/tedrisat";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, key, render, settle } from "./dom";

/**
 * Solving a çalışma seti (MDRS-248, Faz 3): the open attempt goes on at the
 * question it was left at, every choice is saved at once, a failed save says
 * so and can be sent again, and "Bitir" says how many are blank before it
 * ends the attempt and goes to the result.
 */

const mocks = vi.hoisted(() => ({
  startPractice: vi.fn(),
  startPracticePool: vi.fn(),
  savePracticeChoice: vi.fn(),
  finishPractice: vi.fn(),
}));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

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
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("~/lib/send-to-sign-in", () => ({ sendToSignIn: () => false }));
vi.mock("~/features/practice/actions", () => mocks);
// The note icon's Server Actions (soru notları), never called here.
vi.mock("~/features/question-notes/actions", () => ({
  saveMyQuestionNote: vi.fn(),
  deleteMyQuestionNote: vi.fn(),
}));

const ok = <T>(data: T) => ({ success: true as const, data });

const attempt = (
  over: Partial<PracticeAttemptResponse> = {}
): PracticeAttemptResponse => ({
  id: "a1",
  setId: "s1",
  poolMode: null,
  courseId: "c1",
  title: "Birinci bab",
  status: "IN_PROGRESS",
  startedAt: new Date(),
  finishedAt: null,
  currentQuestionId: null,
  questions: [
    {
      id: "q1",
      number: 1,
      text: "Birinci soru",
      answerMode: "SINGLE",
      setTitle: "Birinci bab",
      options: [
        { id: "a", text: "Elif" },
        { id: "b", text: "Be" },
      ],
      chosenOptionIds: [],
    },
    {
      id: "q2",
      number: 2,
      text: "İkinci soru",
      answerMode: "SINGLE",
      setTitle: "Birinci bab",
      options: [
        { id: "c", text: "Cim" },
        { id: "d", text: "Dal" },
      ],
      chosenOptionIds: [],
    },
  ],
  result: null,
  ...over,
});

const button = (label: string) =>
  [...document.querySelectorAll("button")].find(
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

const mount = async (
  source:
    | { setId: string }
    | { courseId: string; mode: "ALL" | "RANDOM"; count?: number } = {
    setId: "s1",
  }
) => {
  const { PracticeTake } = await import(
    "~/features/practice/components/practice-take"
  );
  const host = await render(createElement(PracticeTake, source));
  await settle();
  return host;
};

beforeEach(() => {
  window.sessionStorage.clear();
  for (const m of Object.values(mocks)) m.mockReset();
  router.push.mockReset();
  router.replace.mockReset();
});
afterEach(cleanup);

describe("solving a çalışma seti (MDRS-248)", () => {
  it("goes on at the question the open attempt was left at, with its choice", async () => {
    const open = attempt({ currentQuestionId: "q2" });
    open.questions[1].chosenOptionIds = ["d"];
    mocks.startPractice.mockResolvedValue(ok(open));
    const host = await mount();
    expect(mocks.startPractice).toHaveBeenCalledTimes(1);
    expect(mocks.startPractice).toHaveBeenCalledWith("s1");
    expect(host.textContent).toContain("İkinci soru");
    expect(host.textContent).toContain("Soru 2/2");
    expect(radio(host, "Dal").getAttribute("aria-checked")).toBe("true");
    // No clock and no zeroth question.
    expect(host.querySelector("[role=timer]")).toBeNull();
  });

  it("starts a pool attempt of the course, called a mixed one", async () => {
    mocks.startPracticePool.mockResolvedValue(
      ok(attempt({ setId: null, poolMode: "RANDOM", title: "" }))
    );
    const host = await mount({ courseId: "c1", mode: "RANDOM", count: 20 });
    expect(mocks.startPracticePool).toHaveBeenCalledWith("c1", "RANDOM", 20);
    expect(mocks.startPractice).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Karışık deneme");
    expect(host.textContent).toContain("Birinci soru");
  });

  it("says why a pool attempt could not open", async () => {
    mocks.startPracticePool.mockResolvedValue({
      success: false,
      error: "bad",
      status: 400,
    });
    const host = await mount({ courseId: "c1", mode: "RANDOM", count: 999 });
    expect(host.textContent).toContain("Karışık deneme açılamadı");
  });

  it("saves a choice at once, and says so when it could not", async () => {
    mocks.startPractice.mockResolvedValue(ok(attempt()));
    mocks.savePracticeChoice.mockResolvedValueOnce({
      success: false,
      error: "down",
      status: 503,
    });
    const host = await mount();
    await click(radio(host, "Elif"));
    await settle();
    expect(mocks.savePracticeChoice).toHaveBeenCalledWith("a1", "q1", ["a"]);
    // The choice stays on screen.
    expect(radio(host, "Elif").getAttribute("aria-checked")).toBe("true");
    expect(host.textContent).toContain("Cevabın kaydedilemedi, tekrar dene");

    mocks.savePracticeChoice.mockResolvedValue(
      ok({ questionId: "q1", optionIds: ["a"], savedAt: new Date() })
    );
    await click(button("Tekrar dene"));
    await settle();
    expect(mocks.savePracticeChoice).toHaveBeenCalledTimes(2);
    expect(host.textContent).not.toContain("Cevabın kaydedilemedi");
    expect(host.textContent).toContain("Cevabın kaydedildi.");
  });

  it("never sends an older choice after a newer one on a retry", async () => {
    mocks.startPractice.mockResolvedValue(ok(attempt()));
    const saved = ok({
      questionId: "q1",
      optionIds: ["b"],
      savedAt: new Date(),
    });
    let release: (() => void) | undefined;
    mocks.savePracticeChoice
      .mockResolvedValueOnce({ success: false, error: "down", status: 503 })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = () => resolve(saved);
          })
      )
      .mockResolvedValue(saved);
    const host = await mount();
    await click(radio(host, "Elif"));
    await settle();
    await click(radio(host, "Be"));
    // "Be" is on its way; the retry sends what the screen shows, never "Elif".
    await click(button("Tekrar dene"));
    release?.();
    await settle();
    const sent = mocks.savePracticeChoice.mock.calls.map((c) => c[2]);
    expect(sent[0]).toEqual(["a"]);
    expect(sent.slice(1).every((ids) => ids[0] === "b")).toBe(true);
    expect(host.textContent).not.toContain("Cevabın kaydedilemedi");
  });

  it("asks before Bitir with the blank count, then goes to the result", async () => {
    mocks.startPractice.mockResolvedValue(ok(attempt()));
    mocks.savePracticeChoice.mockResolvedValue(
      ok({ questionId: "q1", optionIds: ["a"], savedAt: new Date() })
    );
    mocks.finishPractice.mockResolvedValue(ok(attempt({ status: "FINISHED" })));
    const host = await mount();
    await click(radio(host, "Elif"));
    await settle();
    await click(button("Bitir"));
    await settle();
    expect(document.body.textContent).toContain(
      "1 soruyu boş bıraktın. Bitirmek istiyor musun?"
    );
    const confirm = [...document.querySelectorAll("button")].filter(
      (b) => b.textContent?.trim() === "Bitir"
    );
    await click(confirm[confirm.length - 1]);
    await settle();
    expect(mocks.finishPractice).toHaveBeenCalledWith("a1");
    expect(router.push).toHaveBeenCalledWith("/calisma-sorulari/deneme/a1");
  });

  it("keeps Bitir in the bar, and puts it in Sonraki's place under the options at the end", async () => {
    mocks.startPractice.mockResolvedValue(ok(attempt()));
    mocks.savePracticeChoice.mockImplementation(async (_a, questionId, ids) =>
      ok({ questionId, optionIds: ids, savedAt: new Date() })
    );
    const host = await mount();
    const bar = host.querySelector(
      "[aria-label='Çalışma durumu']"
    ) as HTMLElement;
    const nav = host.querySelector("[data-testid=take-nav]") as HTMLElement;
    const inBar = bar.querySelector(
      "[data-testid=finish-in-bar]"
    ) as HTMLElement;
    // "Bitir" waits in the bar, quiet; under the options "Sonraki" leads alone.
    expect(inBar.textContent).toBe("Bitir");
    expect(inBar.className).toContain("mds-btn--secondary");
    const lead = nav.querySelector(".take-nav__go") as HTMLButtonElement;
    expect(lead.textContent).toBe("Sonraki");
    expect(lead.className).toContain("mds-btn--primary");
    expect(nav.textContent).not.toContain("Bitir");
    // Right under the options, in the same card.
    const question = host.querySelector("[data-testid=practice-question]");
    expect(nav.closest("[data-testid=practice-question]")).toBe(question);
    expect(host.textContent).toContain("0/2 cevaplandı");
    expect(host.textContent).toContain("Cevaplanmadı (2)");
    await click(radio(host, "Elif"));
    await settle();
    expect(host.textContent).toContain("1/2 cevaplandı");
    expect(host.textContent).toContain("Cevaplandı (1)");
    await click(lead);
    await settle();
    // The last question: the same button now says "Bitir" and leads.
    const last = nav.querySelector(".take-nav__go") as HTMLButtonElement;
    expect(last).toBe(lead);
    expect(last.textContent).toBe("Bitir");
    expect(last.className).toContain("mds-btn--primary");
    expect(
      [...nav.querySelectorAll("button")].map((b) => b.textContent)
    ).not.toContain("Sonraki");
    await click(last);
    await settle();
    expect(document.body.textContent).toContain(
      "1 soruyu boş bıraktın. Bitirmek istiyor musun?"
    );
  });

  it("draws each option as a card with its letter, chosen by a click anywhere on it", async () => {
    mocks.startPractice.mockResolvedValue(ok(attempt()));
    mocks.savePracticeChoice.mockResolvedValue(
      ok({ questionId: "q1", optionIds: ["b"], savedAt: new Date() })
    );
    const host = await mount();
    const be = card(host, "Be") as HTMLLabelElement;
    expect(be.className).toContain("mds-choice--bordered");
    expect(be.closest(".take-options")).toBeTruthy();
    expect(be.querySelector(".take-option__letter")?.textContent).toBe("B");
    expect(
      card(host, "Elif")?.querySelector(".take-option__letter")?.textContent
    ).toBe("A");
    // Still a radio group underneath: the keyboard and a screen reader see one.
    expect(
      host.querySelectorAll("[role=radiogroup] [role=radio]")
    ).toHaveLength(2);
    await click(be.querySelector(".mds-choice__label") as HTMLElement);
    await settle();
    expect(radio(host, "Be").getAttribute("aria-checked")).toBe("true");
    expect(mocks.savePracticeChoice).toHaveBeenCalledWith("a1", "q1", ["b"]);
  });

  it("picks an option with 1–9 or A–Z and goes on with Enter, and Enter at the end asks before Bitir", async () => {
    mocks.startPractice.mockResolvedValue(ok(attempt()));
    mocks.savePracticeChoice.mockImplementation(async (_a, questionId, ids) =>
      ok({ questionId, optionIds: ids, savedAt: new Date() })
    );
    const host = await mount();
    // The shortcuts work without a line that spells them out (MDRS-248):
    // only the leading button names its key, for a screen reader.
    expect(host.textContent).not.toContain("Kısayollar");
    expect(host.querySelector(".take-keys")).toBeNull();
    expect(
      host.querySelector(".take-nav__go")?.getAttribute("aria-keyshortcuts")
    ).toBe("Enter");
    await key(document.body, "2");
    await settle();
    expect(radio(host, "Be").getAttribute("aria-checked")).toBe("true");
    await key(document.body, "a");
    await settle();
    expect(radio(host, "Elif").getAttribute("aria-checked")).toBe("true");
    // A key past the last option does nothing.
    await key(document.body, "c");
    await key(document.body, "9");
    await settle();
    expect(radio(host, "Elif").getAttribute("aria-checked")).toBe("true");
    expect(mocks.savePracticeChoice.mock.calls.map((c) => c[2])).toEqual([
      ["b"],
      ["a"],
    ]);
    await key(document.body, "Enter");
    await settle();
    expect(host.textContent).toContain("İkinci soru");
    await key(document.body, "B");
    await settle();
    expect(radio(host, "Dal").getAttribute("aria-checked")).toBe("true");
    await key(document.body, "Enter");
    await settle();
    expect(document.body.textContent).toContain(
      "Bütün soruları cevapladın. Bitirmek istiyor musun?"
    );
  });

  it("leaves the keys to a field, to a button's own Enter and to Ctrl", async () => {
    mocks.startPractice.mockResolvedValue(ok(attempt()));
    mocks.savePracticeChoice.mockResolvedValue(
      ok({ questionId: "q1", optionIds: ["a"], savedAt: new Date() })
    );
    const host = await mount();
    const field = document.createElement("input");
    document.body.appendChild(field);
    await key(field, "1");
    await key(field, "Enter");
    const previous = button("Önceki");
    await key(button("Soruyu atla"), "Enter");
    await act(async () => {
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { key: "1", ctrlKey: true, bubbles: true })
      );
    });
    await settle();
    expect(previous.disabled).toBe(true);
    expect(mocks.savePracticeChoice).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Birinci soru");
  });

  it("shows check boxes on cards when more than one option may be right, and a key turns one over", async () => {
    const multi = attempt();
    multi.questions[0].answerMode = "MULTIPLE";
    multi.questions[0].options.push({ id: "e", text: "Cim" });
    mocks.startPractice.mockResolvedValue(ok(multi));
    mocks.savePracticeChoice.mockImplementation(async (_a, questionId, ids) =>
      ok({ questionId, optionIds: ids, savedAt: new Date() })
    );
    const host = await mount();
    expect(host.querySelector("[role=radio]")).toBeNull();
    const boxes = host.querySelectorAll(".take-options [role=checkbox]");
    expect(boxes).toHaveLength(3);
    expect(
      card(host, "Cim")?.querySelector(".take-option__letter")?.textContent
    ).toBe("C");
    await key(document.body, "1");
    await settle();
    await key(document.body, "c");
    await settle();
    expect(mocks.savePracticeChoice).toHaveBeenLastCalledWith("a1", "q1", [
      "a",
      "e",
    ]);
    await key(document.body, "1");
    await settle();
    expect(mocks.savePracticeChoice).toHaveBeenLastCalledWith("a1", "q1", [
      "e",
    ]);
    expect(
      card(host, "Cim")
        ?.querySelector("[role=checkbox]")
        ?.getAttribute("aria-checked")
    ).toBe("true");
  });

  it("has A− / A+ once, in the top bar, and keeps its step across questions and a reload", async () => {
    mocks.startPractice.mockResolvedValue(ok(attempt()));
    const host = await mount();
    const groups = host.querySelectorAll("[data-testid=text-size]");
    expect(groups).toHaveLength(1);
    expect(groups[0].getAttribute("aria-label")).toBe("Yazı boyutu");
    // In the bar with the counter, not on the question's card.
    expect(groups[0].closest("[aria-label='Çalışma durumu']")).toBeTruthy();
    expect(groups[0].closest("[data-testid=practice-question]")).toBeNull();
    await click(button("A+"));
    const zoomed = () =>
      (host.querySelector("[data-text-scale]") as HTMLElement).dataset
        .textScale;
    const step = zoomed();
    expect(step).not.toBe("1");
    await click(button("Sonraki"));
    expect(host.textContent).toContain("İkinci soru");
    expect(zoomed()).toBe(step);
    expect(host.querySelectorAll("[data-testid=text-size]")).toHaveLength(1);
    await cleanup();
    mocks.startPractice.mockResolvedValue(ok(attempt()));
    const again = await mount();
    expect(
      (again.querySelector("[data-text-scale]") as HTMLElement).dataset
        .textScale
    ).toBe(step);
  });

  it("draws an Arabic question and option by the standard, and only the Arabic run of a mixed one", async () => {
    const arabic = attempt();
    arabic.questions[0].text = "مَا إِعْرَابُ زَيْدٍ؟";
    arabic.questions[0].options = [
      { id: "a", text: "فَاعِلٌ" },
      { id: "b", text: "Mef'ûl: مَفْعُولٌ" },
    ];
    mocks.startPractice.mockResolvedValue(ok(arabic));
    const host = await mount();
    const question = host.querySelector("#practice-question") as HTMLElement;
    expect(question.getAttribute("lang")).toBe("ar");
    expect(question.getAttribute("dir")).toBe("rtl");
    // happy-dom drops the max() size; the face and the leading are the standard's.
    expect(question.style.fontFamily).toBe("var(--font-arabic)");
    expect(question.style.lineHeight).toBe("var(--lh-arabic-text)");
    const option = [...host.querySelectorAll("[lang=ar]")].find(
      (el) => el.textContent === "فَاعِلٌ"
    ) as HTMLElement;
    expect(option.getAttribute("dir")).toBe("rtl");
    // A block filling its card, so it lines up on the right; its letter stays.
    expect(option.className).toContain("block");
    expect(
      option.closest("label")?.querySelector(".take-option__letter")
        ?.textContent
    ).toBe("A");
    // The mixed option: Turkish at its own size, the Arabic word on its own.
    const run = [...host.querySelectorAll("[lang=ar]")].find(
      (el) => el.textContent === "مَفْعُولٌ"
    ) as HTMLElement;
    expect(run.getAttribute("data-arabic-block")).toBe("");
    expect(run.parentElement?.getAttribute("lang")).toBeNull();
    expect(run.parentElement?.hasAttribute("dir")).toBe(false);
    expect(run.parentElement?.hasAttribute("data-mixed-arabic")).toBe(true);
    expect(run.parentElement?.textContent).toBe("Mef'ûl: مَفْعُولٌ");
  });

  it("says the set is not there when the API refuses it", async () => {
    mocks.startPractice.mockResolvedValue({
      success: false,
      error: "nope",
      status: 404,
      code: "PRACTICE_SET_NOT_FOUND",
    });
    const host = await mount();
    expect(host.textContent).toContain("Bu çalışma seti bulunamadı");
    expect(host.textContent).toContain("Çalışma sorularına dön");
  });
});
