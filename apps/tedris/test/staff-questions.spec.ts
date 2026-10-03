// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type { CourseQuestionResponse } from "@medaris/services/tedrisat";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, render, settle } from "./dom";

/**
 * The staff's "Sorular" tab (MDRS-150): the course's questions, those still
 * waiting first, and the answer form for whoever holds `question.answer`.
 */

const mocks = vi.hoisted(() => ({ answer: vi.fn() }));

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
  listMyCourseQuestions: vi.fn(),
  askLessonQuestion: vi.fn(),
  answerLessonQuestion: mocks.answer,
}));
vi.mock("../features/courses/actions/questions", () => ({
  listMyCourseQuestions: vi.fn(),
  askLessonQuestion: vi.fn(),
  answerLessonQuestion: mocks.answer,
}));

const tr = resources.tr.tedrisLearn.StaffQuestions;

const question = (
  id: string,
  over: Partial<CourseQuestionResponse> = {}
): CourseQuestionResponse => ({
  id,
  lessonId: "l1",
  lessonTitle: "Birinci celse",
  weekNumber: 1,
  body: id,
  createdAt: new Date("2026-10-03T18:00:00Z"),
  author: { id: "a1", name: "Ali Veli" },
  answer: null,
  ...over,
});

const answered = (id: string, body: string): CourseQuestionResponse =>
  question(id, {
    answer: {
      body,
      answeredAt: new Date("2026-10-04T08:00:00Z"),
      answeredBy: { id: "m1", name: "Mehmed Efendi" },
    },
  });

const ok = <T>(data: T) => ({ success: true as const, data });

beforeEach(() => mocks.answer.mockReset());
afterEach(cleanup);

const mount = async (initial: CourseQuestionResponse[]) => {
  const { StaffQuestions } = await import(
    "~/features/courses/components/staff-questions"
  );
  const host = await render(
    createElement(StaffQuestions, { initial, timeZone: "Europe/Istanbul" })
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

const button = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll("button")].find(
    (b) => b.textContent === label
  ) as HTMLButtonElement;

describe("the staff's list", () => {
  it("names who asked, on which session, and keeps the API's order", async () => {
    const host = await mount([
      question("Bekleyen"),
      question("Eski soru", { author: { id: "a2", name: null } }),
      answered("Cevaplı", "Cevap metni"),
    ]);
    const cards = host.querySelectorAll("article");
    expect(cards).toHaveLength(3);
    expect(cards[0].textContent).toContain("Ali Veli");
    expect(cards[0].textContent).toContain("Hafta 1 · Birinci celse");
    expect(cards[0].textContent).toContain(tr.waiting);
    expect(cards[1].textContent).toContain(tr.unknownAuthor);
    expect(cards[2].textContent).toContain(tr.answered);
    expect(cards[2].textContent).toContain("Cevap: Mehmed Efendi");
    expect(cards[2].textContent).toContain("Cevap metni");
  });

  it("says when nobody has asked", async () => {
    const host = await mount([]);
    expect(host.textContent).toContain(tr.empty);
    expect(host.querySelector("textarea")).toBeNull();
  });

  it("shows a question's HTML as text, never as markup", async () => {
    const host = await mount([question("<img src=x onerror=alert(1)>")]);
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});

describe("answering", () => {
  it("sends the answer for that question and shows it, with the form gone", async () => {
    mocks.answer.mockResolvedValue(ok(answered("Bekleyen", "Müstesnâdır.")));
    const host = await mount([question("Bekleyen"), question("Öteki")]);
    const forms = host.querySelectorAll("form");
    expect(forms).toHaveLength(2);

    await set(
      forms[0].querySelector("textarea") as HTMLTextAreaElement,
      "Müstesnâdır."
    );
    await click(forms[0].querySelector("button[type=submit]") as Element);
    await settle();

    expect(mocks.answer).toHaveBeenCalledTimes(1);
    expect(mocks.answer).toHaveBeenCalledWith("Bekleyen", "Müstesnâdır.");
    const cards = host.querySelectorAll("article");
    expect(cards[0].textContent).toContain("Müstesnâdır.");
    expect(cards[0].querySelector("form")).toBeNull();
    // The other question still waits, with its form.
    expect(cards[1].querySelector("form")).not.toBeNull();
  });

  it("refuses an empty answer without asking the API", async () => {
    const host = await mount([question("Bekleyen")]);
    await set(host.querySelector("textarea") as HTMLTextAreaElement, "  ");
    await click(host.querySelector("button[type=submit]") as Element);
    expect(host.textContent).toContain(tr.bodyRequired);
    expect(mocks.answer).not.toHaveBeenCalled();
  });

  it("says so when the permission was taken back (404)", async () => {
    mocks.answer.mockResolvedValue({ success: false, error: "x", status: 404 });
    const host = await mount([question("Bekleyen")]);
    await set(host.querySelector("textarea") as HTMLTextAreaElement, "Cevap");
    await click(host.querySelector("button[type=submit]") as Element);
    await settle();
    expect(host.textContent).toContain(tr.notAllowed);
    expect((host.querySelector("textarea") as HTMLTextAreaElement).value).toBe(
      "Cevap"
    );
  });

  it("keeps the text and says it failed when the send fails", async () => {
    mocks.answer.mockResolvedValue({ success: false, error: "down" });
    const host = await mount([question("Bekleyen")]);
    await set(host.querySelector("textarea") as HTMLTextAreaElement, "Cevap");
    await click(host.querySelector("button[type=submit]") as Element);
    await settle();
    expect(host.textContent).toContain(tr.answerFailed);
    expect((host.querySelector("textarea") as HTMLTextAreaElement).value).toBe(
      "Cevap"
    );
  });

  it("changes an earlier answer, starting from its text, and can back out", async () => {
    mocks.answer.mockResolvedValue(ok(answered("Cevaplı", "Yeni cevap")));
    const host = await mount([answered("Cevaplı", "Eski cevap")]);
    expect(host.querySelector("textarea")).toBeNull();

    await click(button(host, tr.change));
    const box = host.querySelector("textarea") as HTMLTextAreaElement;
    expect(box.value).toBe("Eski cevap");
    await click(button(host, tr.cancel));
    expect(host.querySelector("textarea")).toBeNull();
    expect(mocks.answer).not.toHaveBeenCalled();

    await click(button(host, tr.change));
    await set(
      host.querySelector("textarea") as HTMLTextAreaElement,
      "Yeni cevap"
    );
    await click(host.querySelector("button[type=submit]") as Element);
    await settle();
    expect(mocks.answer).toHaveBeenCalledWith("Cevaplı", "Yeni cevap");
    expect(host.textContent).toContain("Yeni cevap");
    expect(host.textContent).not.toContain("Eski cevap");
  });
});
