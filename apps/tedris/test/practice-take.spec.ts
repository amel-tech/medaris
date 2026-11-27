// @vitest-environment happy-dom
import type { PracticeAttemptResponse } from "@medaris/services/tedrisat";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, render, settle } from "./dom";

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
const radio = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll("label")]
    .find((l) => l.textContent?.trim() === label)
    ?.querySelector("[role=radio]") as HTMLElement;

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
