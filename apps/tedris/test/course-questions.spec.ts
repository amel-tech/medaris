// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type { LessonQuestionResponse } from "@medaris/services/tedrisat";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, render, settle } from "./dom";

/**
 * The "Sorularım" tab (MDRS-150): the talebe's own questions with the answers
 * they were given, and the form to ask a new one on a session.
 */

const mocks = vi.hoisted(() => ({ list: vi.fn(), ask: vi.fn() }));

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
vi.mock("~/features/courses/actions/questions", () => ({
  listMyCourseQuestions: mocks.list,
  askLessonQuestion: mocks.ask,
  answerLessonQuestion: vi.fn(),
}));
vi.mock("../features/courses/actions/questions", () => ({
  listMyCourseQuestions: mocks.list,
  askLessonQuestion: mocks.ask,
  answerLessonQuestion: vi.fn(),
}));

const tr = resources.tr.tedrisLearn.CourseQuestions;

const SESSIONS = [
  { id: "l1", weekNumber: 1, title: "Birinci celse" },
  { id: "l2", weekNumber: 2, title: "İkinci celse" },
];

const question = (
  id: string,
  over: Partial<LessonQuestionResponse> = {}
): LessonQuestionResponse => ({
  id,
  lessonId: "l1",
  lessonTitle: "Birinci celse",
  weekNumber: 1,
  body: id,
  createdAt: new Date("2026-10-03T18:00:00Z"),
  answer: null,
  ...over,
});

const ok = <T>(data: T) => ({ success: true as const, data });

beforeEach(() => {
  mocks.list.mockReset();
  mocks.ask.mockReset();
  mocks.list.mockResolvedValue(ok([]));
});
afterEach(cleanup);

const mount = async (props: { canAsk?: boolean } = {}) => {
  const { CourseQuestions } = await import(
    "~/features/courses/components/course-questions"
  );
  const host = await render(
    createElement(CourseQuestions, {
      courseId: "c1",
      sessions: SESSIONS,
      timeZone: "Europe/Istanbul",
      canAsk: true,
      ...props,
    })
  );
  await settle();
  return host;
};

const set = async (el: HTMLTextAreaElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });

const textarea = (host: HTMLElement) =>
  host.querySelector("textarea") as HTMLTextAreaElement;
const submit = (host: HTMLElement) =>
  host.querySelector("button[type=submit]") as HTMLButtonElement;

/** Opens the session select and picks the option whose text is `label`. */
const choose = async (label: string) => {
  await click(document.querySelector("button.mds-input") as Element);
  await settle(50);
  const option = [...document.querySelectorAll(".mds-option")].find(
    (o) => o.textContent?.trim() === label
  );
  expect(option, label).toBeDefined();
  await click(option as Element);
  await settle(80);
};

describe("reading the questions", () => {
  it("says who sees them, and asks the API for this course only", async () => {
    const host = await mount();
    expect(host.textContent).toContain(tr.private);
    expect(mocks.list).toHaveBeenCalledWith("c1");
    expect(host.textContent).toContain(tr.empty);
  });

  it("lists a question that waits and one that was answered, with who answered", async () => {
    mocks.list.mockResolvedValue(
      ok([
        question("Bekleyen soru"),
        question("Cevaplanan soru", {
          lessonId: "l2",
          lessonTitle: "İkinci celse",
          weekNumber: 2,
          answer: {
            body: "Müstesnâdır, **mef'ûl-ü bih** değil.",
            answeredAt: new Date("2026-10-04T08:00:00Z"),
            answeredBy: { id: "m1", name: "Mehmed Efendi" },
          },
        }),
      ])
    );
    const host = await mount();
    const cards = host.querySelectorAll("article");
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain("Bekleyen soru");
    expect(cards[0].textContent).toContain(tr.waiting);
    expect(cards[0].textContent).toContain("Hafta 1 · Birinci celse");
    expect(cards[1].textContent).toContain("Cevaplanan soru");
    expect(cards[1].textContent).toContain(tr.answered);
    expect(cards[1].textContent).toContain("Cevap: Mehmed Efendi");
    expect(cards[1].textContent).toContain("Müstesnâdır");
    // The answer is Markdown, rendered: the bold run is an element.
    expect(cards[1].querySelector("strong")?.textContent).toBe("mef'ûl-ü bih");
  });

  it("shows a question's HTML as text, never as markup", async () => {
    mocks.list.mockResolvedValue(
      ok([question("<img src=x onerror=alert(1)> <script>x()</script>")])
    );
    const host = await mount();
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("script")).toBeNull();
    expect(host.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("offers a retry when the questions cannot be read", async () => {
    mocks.list.mockResolvedValueOnce({ success: false, error: "x" });
    const host = await mount();
    expect(host.textContent).toContain(tr.loadFailed);
    mocks.list.mockResolvedValue(ok([question("Geldi")]));
    const retry = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === tr.retry
    ) as HTMLButtonElement;
    await click(retry);
    await settle();
    expect(host.textContent).toContain("Geldi");
    expect(host.textContent).not.toContain(tr.loadFailed);
  });

  it("keeps the questions and takes the form away from a talebe who may not ask", async () => {
    mocks.list.mockResolvedValue(ok([question("Eski soru")]));
    const host = await mount({ canAsk: false });
    expect(host.textContent).toContain("Eski soru");
    expect(host.querySelector("form")).toBeNull();
    expect(host.querySelector("textarea")).toBeNull();
  });
});

describe("asking", () => {
  it("sends the question on the chosen session and puts it first", async () => {
    mocks.list.mockResolvedValue(ok([question("Eski soru")]));
    mocks.ask.mockResolvedValue(
      ok(
        question("Yeni soru", {
          id: "q2",
          lessonId: "l2",
          lessonTitle: "İkinci celse",
          weekNumber: 2,
        })
      )
    );
    const host = await mount();
    await choose("Hafta 2 · İkinci celse");
    await set(textarea(host), "Yeni soru");
    await click(submit(host));
    await settle();

    expect(mocks.ask).toHaveBeenCalledWith("l2", "Yeni soru");
    const cards = host.querySelectorAll("article");
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain("Yeni soru");
    expect(textarea(host).value).toBe("");
  });

  it("asks for a session and for text before it sends anything", async () => {
    const host = await mount();
    await set(textarea(host), "Soru");
    await click(submit(host));
    expect(host.textContent).toContain(tr.sessionRequired);

    await choose("Hafta 1 · Birinci celse");
    await set(textarea(host), "   ");
    await click(submit(host));
    expect(host.textContent).toContain(tr.bodyRequired);
    expect(mocks.ask).not.toHaveBeenCalled();
  });

  it("says so when the API refuses a talebe who is no longer enrolled", async () => {
    mocks.ask.mockResolvedValue({ success: false, error: "x", status: 403 });
    const host = await mount();
    await choose("Hafta 1 · Birinci celse");
    await set(textarea(host), "Soru");
    await click(submit(host));
    await settle();
    expect(host.textContent).toContain(tr.forbidden);
    expect(textarea(host).value).toBe("Soru");
  });

  it("keeps the text and says it failed when the send fails", async () => {
    mocks.ask.mockRejectedValue(new Error("down"));
    const host = await mount();
    await choose("Hafta 1 · Birinci celse");
    await set(textarea(host), "Soru");
    await click(submit(host));
    await settle();
    expect(host.textContent).toContain(tr.askFailed);
    expect(textarea(host).value).toBe("Soru");
  });
});
