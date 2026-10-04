// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type { LessonQuestionResponse } from "@medaris/services/tedrisat";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, render, settle } from "./dom";

/**
 * The "Sorularım" tab (MDRS-150): the talebe's own questions with the answers
 * they were given, the form to ask a new one on a session, and editing,
 * deleting and paging them.
 */

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  ask: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
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
vi.mock("~/features/courses/actions/questions", () => ({
  listMyCourseQuestions: mocks.list,
  askLessonQuestion: mocks.ask,
  updateLessonQuestion: mocks.update,
  deleteLessonQuestion: mocks.remove,
}));
vi.mock("../features/courses/actions/questions", () => ({
  listMyCourseQuestions: mocks.list,
  askLessonQuestion: mocks.ask,
  updateLessonQuestion: mocks.update,
  deleteLessonQuestion: mocks.remove,
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
const page = (
  items: LessonQuestionResponse[],
  nextCursor: string | null = null
) => ok({ items, nextCursor });

beforeEach(() => {
  mocks.list.mockReset();
  mocks.ask.mockReset();
  mocks.update.mockReset();
  mocks.remove.mockReset();
  mocks.list.mockResolvedValue(page([]));
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
      page([
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
      page([question("<img src=x onerror=alert(1)> <script>x()</script>")])
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
    mocks.list.mockResolvedValue(page([question("Geldi")]));
    const retry = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === tr.retry
    ) as HTMLButtonElement;
    await click(retry);
    await settle();
    expect(host.textContent).toContain("Geldi");
    expect(host.textContent).not.toContain(tr.loadFailed);
  });

  it("keeps the questions and takes the form away from a talebe who may not ask", async () => {
    mocks.list.mockResolvedValue(page([question("Eski soru")]));
    const host = await mount({ canAsk: false });
    expect(host.textContent).toContain("Eski soru");
    expect(host.querySelector("form")).toBeNull();
    expect(host.querySelector("textarea")).toBeNull();
  });
});

describe("asking", () => {
  it("sends the question on the chosen session and puts it first", async () => {
    mocks.list.mockResolvedValue(page([question("Eski soru")]));
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

const ANSWER = {
  body: "Cevap",
  answeredAt: new Date("2026-10-04T08:00:00Z"),
  answeredBy: { id: "m1", name: "Mehmed Efendi" },
};

/** The edit form of the question card that is being edited, not the ask form above the list. */
const editBox = (host: HTMLElement) =>
  host.querySelector("article textarea") as HTMLTextAreaElement;
const editSave = (host: HTMLElement) =>
  host.querySelector("article button[type=submit]") as HTMLButtonElement;

const button = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement | undefined;

describe("paging", () => {
  it("shows Daha fazla göster only while the API gave a cursor, and asks for the next page with it", async () => {
    mocks.list
      .mockResolvedValueOnce(page([question("Birinci")], "cursor-1"))
      .mockResolvedValueOnce(page([question("İkinci")], "cursor-2"))
      .mockResolvedValueOnce(page([question("Üçüncü")], null));
    const host = await mount();
    expect(host.querySelectorAll("article")).toHaveLength(1);

    await click(button(host, tr.loadMore) as Element);
    await settle();
    expect(mocks.list).toHaveBeenLastCalledWith("c1", "cursor-1");
    expect(host.querySelectorAll("article")).toHaveLength(2);
    expect(button(host, tr.loadMore)).toBeDefined();

    await click(button(host, tr.loadMore) as Element);
    await settle();
    expect(mocks.list).toHaveBeenLastCalledWith("c1", "cursor-2");
    const bodies = [...host.querySelectorAll("article")].map(
      (a) => a.textContent
    );
    expect(bodies[0]).toContain("Birinci");
    expect(bodies[1]).toContain("İkinci");
    expect(bodies[2]).toContain("Üçüncü");
    expect(button(host, tr.loadMore)).toBeUndefined();
  });

  it("offers no button when the first page is the last", async () => {
    mocks.list.mockResolvedValue(page([question("Tek")]));
    const host = await mount();
    expect(button(host, tr.loadMore)).toBeUndefined();
  });

  it("says so when the next page fails, keeps what is shown, and tries again", async () => {
    mocks.list
      .mockResolvedValueOnce(page([question("Birinci")], "cursor-1"))
      .mockResolvedValueOnce({ success: false, error: "x" })
      .mockResolvedValueOnce(page([question("İkinci")]));
    const host = await mount();
    await click(button(host, tr.loadMore) as Element);
    await settle();
    expect(host.textContent).toContain(tr.loadMoreFailed);
    expect(host.querySelectorAll("article")).toHaveLength(1);

    await click(button(host, tr.loadMore) as Element);
    await settle();
    expect(host.textContent).not.toContain(tr.loadMoreFailed);
    expect(host.querySelectorAll("article")).toHaveLength(2);
  });

  it("does not show a question twice when one was asked after the first page", async () => {
    mocks.list
      .mockResolvedValueOnce(page([question("Eski", { id: "q1" })], "cursor-1"))
      .mockResolvedValueOnce(page([question("Eski", { id: "q1" })]));
    const host = await mount();
    await click(button(host, tr.loadMore) as Element);
    await settle();
    expect(host.querySelectorAll("article")).toHaveLength(1);
  });
});

describe("editing", () => {
  it("offers Düzenle on an unanswered question only", async () => {
    mocks.list.mockResolvedValue(
      page([
        question("Bekleyen", { id: "q1" }),
        question("Cevaplı", { id: "q2", answer: ANSWER }),
      ])
    );
    const host = await mount();
    const [waiting, answered] = [...host.querySelectorAll("article")];
    expect(button(waiting as HTMLElement, tr.edit)).toBeDefined();
    expect(button(answered as HTMLElement, tr.edit)).toBeUndefined();
    // Deleting stays possible on both.
    expect(button(waiting as HTMLElement, tr.delete)).toBeDefined();
    expect(button(answered as HTMLElement, tr.delete)).toBeDefined();
  });

  it("rewrites the question in place with what the API returned", async () => {
    mocks.list.mockResolvedValue(page([question("Eski metin", { id: "q1" })]));
    mocks.update.mockResolvedValue(ok(question("Yeni metin", { id: "q1" })));
    const host = await mount();
    await click(button(host, tr.edit) as Element);
    expect(editBox(host).value).toBe("Eski metin");
    await set(editBox(host), "Yeni metin");
    await click(editSave(host));
    await settle();

    expect(mocks.update).toHaveBeenCalledWith("q1", "Yeni metin");
    expect(host.querySelectorAll("article")).toHaveLength(1);
    expect(host.textContent).toContain("Yeni metin");
    // Only the ask form's box is left.
    expect(host.querySelectorAll("textarea")).toHaveLength(1);
  });

  it("does not send an empty text", async () => {
    mocks.list.mockResolvedValue(page([question("Eski metin", { id: "q1" })]));
    const host = await mount();
    await click(button(host, tr.edit) as Element);
    await set(editBox(host), "  ");
    await click(editSave(host));
    expect(host.textContent).toContain(tr.bodyRequired);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("leaves the question as it was when Vazgeç is chosen", async () => {
    mocks.list.mockResolvedValue(page([question("Eski metin", { id: "q1" })]));
    const host = await mount();
    await click(button(host, tr.edit) as Element);
    await set(editBox(host), "Başka");
    await click(button(host, tr.cancel) as Element);
    expect(host.textContent).toContain("Eski metin");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("says so, and takes Düzenle away, when the API says it was answered meanwhile", async () => {
    mocks.list.mockResolvedValue(page([question("Eski metin", { id: "q1" })]));
    mocks.update.mockResolvedValue({ success: false, error: "x", status: 409 });
    const host = await mount();
    await click(button(host, tr.edit) as Element);
    await set(editBox(host), "Yeni");
    await click(editSave(host));
    await settle();
    expect(host.textContent).toContain(tr.editAnswered);
    expect(button(host, tr.edit)).toBeUndefined();
  });

  it("keeps the draft and says it failed when the save fails", async () => {
    mocks.list.mockResolvedValue(page([question("Eski metin", { id: "q1" })]));
    mocks.update.mockRejectedValue(new Error("down"));
    const host = await mount();
    await click(button(host, tr.edit) as Element);
    await set(editBox(host), "Yeni");
    await click(editSave(host));
    await settle();
    expect(host.textContent).toContain(tr.editFailed);
    expect(editBox(host).value).toBe("Yeni");
  });

  it("says so when the API refuses a talebe who is no longer enrolled", async () => {
    mocks.list.mockResolvedValue(page([question("Eski metin", { id: "q1" })]));
    mocks.update.mockResolvedValue({ success: false, error: "x", status: 403 });
    const host = await mount();
    await click(button(host, tr.edit) as Element);
    await set(editBox(host), "Yeni");
    await click(editSave(host));
    await settle();
    expect(host.textContent).toContain(tr.forbidden);
  });

  it("drops a question the API no longer has", async () => {
    mocks.list.mockResolvedValue(page([question("Eski metin", { id: "q1" })]));
    mocks.update.mockResolvedValue({ success: false, error: "x", status: 404 });
    const host = await mount();
    await click(button(host, tr.edit) as Element);
    await set(editBox(host), "Yeni");
    await click(editSave(host));
    await settle();
    expect(host.querySelectorAll("article")).toHaveLength(0);
  });
});

describe("deleting", () => {
  it("asks first, and removes the question only on Sil", async () => {
    mocks.list.mockResolvedValue(
      page([
        question("Alfa soru", { id: "q1" }),
        question("Beta soru", { id: "q2" }),
      ])
    );
    mocks.remove.mockResolvedValue(ok(undefined));
    const host = await mount();
    const first = () => host.querySelectorAll("article")[0] as HTMLElement;

    await click(button(first(), tr.delete) as Element);
    expect(first().textContent).toContain(tr.deleteAsk);
    expect(mocks.remove).not.toHaveBeenCalled();

    // Vazgeç leaves everything as it was.
    await click(button(first(), tr.cancel) as Element);
    expect(first().textContent).not.toContain(tr.deleteAsk);

    await click(button(first(), tr.delete) as Element);
    await click(button(first(), tr.delete) as Element);
    await settle();
    expect(mocks.remove).toHaveBeenCalledWith("q1");
    expect(host.querySelectorAll("article")).toHaveLength(1);
    expect(host.textContent).toContain("Beta soru");
    expect(host.textContent).not.toContain("Alfa soru");
  });

  it("says in the confirmation that an answered question's answer goes with it", async () => {
    mocks.list.mockResolvedValue(
      page([question("Cevaplı", { id: "q1", answer: ANSWER })])
    );
    const host = await mount();
    await click(button(host, tr.delete) as Element);
    expect(host.textContent).toContain(tr.deleteAskAnswered);
  });

  it("treats a question that is gone already as deleted", async () => {
    mocks.list.mockResolvedValue(page([question("Alfa soru", { id: "q1" })]));
    mocks.remove.mockResolvedValue({ success: false, error: "x", status: 404 });
    const host = await mount();
    await click(button(host, tr.delete) as Element);
    await click(button(host, tr.delete) as Element);
    await settle();
    expect(host.querySelectorAll("article")).toHaveLength(0);
  });

  it("keeps the question and says it failed when the delete fails", async () => {
    mocks.list.mockResolvedValue(page([question("Alfa soru", { id: "q1" })]));
    mocks.remove.mockResolvedValue({ success: false, error: "x", status: 500 });
    const host = await mount();
    await click(button(host, tr.delete) as Element);
    await click(button(host, tr.delete) as Element);
    await settle();
    expect(host.querySelectorAll("article")).toHaveLength(1);
    expect(host.textContent).toContain(tr.deleteFailed);
  });

  it("is still offered to a talebe who may no longer ask", async () => {
    mocks.list.mockResolvedValue(page([question("Eski", { id: "q1" })]));
    const host = await mount({ canAsk: false });
    expect(button(host, tr.delete)).toBeDefined();
  });
});
