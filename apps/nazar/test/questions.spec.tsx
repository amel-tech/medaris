// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type { CourseQuestionResponse } from "@medaris/services/tedrisat";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { act, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANSWER_BODY_MAX,
  answerErrorKey,
  appendQuestions,
  questionWhen,
} from "~/features/questions/questions";
import { cleanup, click, render, settle } from "./dom";
import { expand, html, textOf, translatorFor } from "./server-render";

/**
 * Sorular of a course (MDRS-150) as the server renders it, and what can be done
 * on it: read the questions, answer, replace an answer, ask for the next page.
 * The reads, the portal and the actions are stubs; what is under test is what
 * the page does with each answer.
 */
type Answer<T> =
  | { status: "ok"; data: T }
  | { status: "forbidden" }
  | { status: "failed" };

const state = {
  questions: { status: "failed" } as Answer<unknown>,
  asked: [] as unknown[],
};
const loadQuestions = vi.fn();
const answerQuestion = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => translatorFor(namespace),
  getLocale: async () => "tr",
}));
vi.mock("~/lib/tedrisat-read", () => ({
  readOnce: async (_what: string, call: (api: unknown) => Promise<unknown>) => {
    await call({
      lessons: {
        listCourseQuestions: async (request: unknown) => {
          state.asked.push(request);
        },
      },
    });
    return state.questions;
  },
}));
vi.mock("~/features/account/reads", () => ({
  getViewer: async () => ({ id: "u-1", timeZone: "Europe/Istanbul" }),
}));
vi.mock("~/features/shell/reads", () => ({
  getPortal: async () => ({
    status: "ok",
    scopes: [
      {
        kind: "ders",
        id: COURSE_ID,
        name: "Bina ve İzhar Şerhi",
        role: "MUDERRIS",
        isImam: false,
        koskName: null,
      },
    ],
  }),
}));
vi.mock("~/features/questions/actions", () => ({
  loadQuestions: (courseId: string, cursor: string) =>
    loadQuestions(courseId, cursor),
  answerQuestion: (id: string, body: string) => answerQuestion(id, body),
}));

const COURSE_ID = "5b6f8d7e-0c1a-4d3b-8a2e-1f9c3d4e5a6b";

const question = (
  body: string,
  over: Partial<CourseQuestionResponse> = {}
): CourseQuestionResponse => ({
  id: `q-${body}`,
  lessonId: "l-1",
  lessonTitle: "Birinci celse",
  weekNumber: 1,
  body,
  createdAt: new Date("2026-10-03T18:00:00Z"),
  author: { id: "a-1", name: "Ali Veli" },
  answer: null,
  ...over,
});

const ANSWERED = {
  body: "Müstesnâdır, **mef'ûl-ü bih** değil.",
  answeredAt: new Date("2026-10-04T08:00:00Z"),
  answeredBy: { id: "m-1", name: "Mehmed Efendi" },
};

const page = (
  items: CourseQuestionResponse[],
  nextCursor: string | null = null
) => ({
  status: "ok" as const,
  data: { items, nextCursor },
});
const ok = <T,>(data: T) => ({ success: true as const, data });

const wrap = (node: React.ReactNode) => (
  <NextIntlClientProvider
    locale="tr"
    timeZone="Europe/Istanbul"
    messages={{ nazar: resources.tr.nazar }}
  >
    <ToastProvider>
      {node}
      <Toaster />
    </ToastProvider>
  </NextIntlClientProvider>
);

const element = async () => {
  const { QuestionsPage } = await import(
    "~/features/questions/components/questions-page"
  );
  return wrap(<QuestionsPage courseId={COURSE_ID} />);
};
const markup = async () => html(await element());
const mount = async () => {
  await render((await expand(await element())) as ReactElement);
  await settle(40);
};

const tr = resources.tr.nazar.Questions;
const cards = () => [...document.querySelectorAll("article")];
const buttonIn = (root: ParentNode, label: string) =>
  [...root.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement | undefined;
const boxIn = (root: ParentNode) =>
  root.querySelector("textarea") as HTMLTextAreaElement;
const set = async (el: HTMLTextAreaElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });

beforeEach(() => {
  state.questions = page([]);
  state.asked = [];
  loadQuestions.mockReset();
  answerQuestion.mockReset();
});
afterEach(cleanup);

describe("reading the questions", () => {
  it("asks the API for this course's questions, and names the course", async () => {
    state.questions = page([question("Bir soru")]);
    const text = textOf(await markup());
    expect(state.asked).toEqual([{ id: COURSE_ID }]);
    expect(text).toContain(tr.title);
    expect(text).toContain(
      "Bina ve İzhar Şerhi’nin talebelerinin celselerde sorduğu sorular"
    );
  });

  it("lists a waiting question and an answered one with who asked, which celse, and when", async () => {
    state.questions = page([
      question("Bekleyen soru"),
      question("Cevaplanan soru", {
        lessonTitle: "İkinci celse",
        weekNumber: 2,
        author: { id: "a-2", name: null },
        answer: ANSWERED,
      }),
    ]);
    await mount();
    const [waiting, answered] = cards();
    expect(waiting.textContent).toContain("Bekleyen soru");
    expect(waiting.textContent).toContain("Ali Veli");
    expect(waiting.textContent).toContain("Hafta 1 · Birinci celse");
    expect(waiting.textContent).toContain(tr.waiting);
    // In the viewer's zone: 18:00 UTC is 21:00 in Istanbul.
    expect(waiting.textContent).toContain("3 Eki 2026 21:00");
    expect(answered.textContent).toContain(tr.unknownAuthor);
    expect(answered.textContent).toContain("Hafta 2 · İkinci celse");
    expect(answered.textContent).toContain(tr.answered);
    expect(answered.textContent).toContain("Cevap: Mehmed Efendi");
    // The answer is Markdown, rendered: the bold run is an element.
    expect(answered.querySelector("strong")?.textContent).toBe("mef'ûl-ü bih");
  });

  it("keeps the API's order: those waiting first", async () => {
    state.questions = page([
      question("Bekleyen bir"),
      question("Bekleyen iki"),
      question("Cevaplı", { answer: ANSWERED }),
    ]);
    await mount();
    expect(cards().map((card) => card.getAttribute("aria-label"))).toHaveLength(
      3
    );
    expect(cards()[2].textContent).toContain("Cevaplı");
  });

  it("shows a question's HTML as text, never as markup", async () => {
    state.questions = page([
      question("<img src=x onerror=alert(1)> <script>x()</script>"),
    ]);
    await mount();
    expect(document.querySelector("article img")).toBeNull();
    expect(document.querySelector("article script")).toBeNull();
    expect(cards()[0].textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("says there is nothing to answer when nobody asked", async () => {
    state.questions = page([]);
    const text = textOf(await markup());
    expect(text).toContain(tr.empty);
    expect(text).not.toContain(tr.loadMore);
  });

  it("answers a person the API refuses with a notice, and draws no question", async () => {
    state.questions = { status: "forbidden" };
    const text = textOf(await markup());
    expect(text).toContain(resources.tr.nazar.Problems.forbiddenTitle);
    expect(text).not.toContain(tr.empty);
  });

  it("answers a read that failed with a retry state, never with 'no access'", async () => {
    state.questions = { status: "failed" };
    const text = textOf(await markup());
    expect(text).toContain(tr.loadFailedTitle);
    expect(text).not.toContain(resources.tr.nazar.Problems.forbiddenTitle);
  });
});

describe("answering", () => {
  it("sends the answer of a waiting question and shows it in the same place", async () => {
    state.questions = page([question("Birinci"), question("İkinci")]);
    answerQuestion.mockResolvedValue(
      ok(question("Birinci", { answer: ANSWERED }))
    );
    await mount();
    await set(boxIn(cards()[0]), "  Cevabım  ");
    await click(buttonIn(cards()[0], tr.answerAction) as Element);
    await settle();

    expect(answerQuestion).toHaveBeenCalledWith("q-Birinci", "  Cevabım  ");
    expect(cards()).toHaveLength(2);
    expect(cards()[0].textContent).toContain(tr.answered);
    expect(cards()[0].textContent).toContain("Cevap: Mehmed Efendi");
    expect(cards()[0].querySelector("textarea")).toBeNull();
    // The other question is untouched.
    expect(cards()[1].textContent).toContain(tr.waiting);
  });

  it("does not send an empty answer", async () => {
    state.questions = page([question("Birinci")]);
    await mount();
    await set(boxIn(cards()[0]), "   ");
    await click(buttonIn(cards()[0], tr.answerAction) as Element);
    expect(cards()[0].textContent).toContain(tr.bodyRequired);
    expect(answerQuestion).not.toHaveBeenCalled();
  });

  it("limits the box to what the API takes", async () => {
    state.questions = page([question("Birinci")]);
    await mount();
    expect(boxIn(cards()[0]).maxLength).toBe(ANSWER_BODY_MAX);
    expect(ANSWER_BODY_MAX).toBe(4000);
  });

  it("replaces an answer: the box starts with it, and Vazgeç leaves it as it was", async () => {
    state.questions = page([question("Birinci", { answer: ANSWERED })]);
    answerQuestion.mockResolvedValue(
      ok(
        question("Birinci", {
          answer: { ...ANSWERED, body: "Yeni cevap" },
        })
      )
    );
    await mount();
    await click(buttonIn(cards()[0], tr.change) as Element);
    expect(boxIn(cards()[0]).value).toBe(ANSWERED.body);

    await set(boxIn(cards()[0]), "Başka");
    await click(buttonIn(cards()[0], tr.cancel) as Element);
    expect(cards()[0].textContent).toContain("mef'ûl-ü bih");
    expect(answerQuestion).not.toHaveBeenCalled();

    await click(buttonIn(cards()[0], tr.change) as Element);
    await set(boxIn(cards()[0]), "Yeni cevap");
    await click(buttonIn(cards()[0], tr.save) as Element);
    await settle();
    expect(answerQuestion).toHaveBeenCalledWith("q-Birinci", "Yeni cevap");
    expect(cards()[0].textContent).toContain("Yeni cevap");
  });

  it("says the question is gone, or not theirs to answer, on the API's 404", async () => {
    state.questions = page([question("Birinci")]);
    answerQuestion.mockResolvedValue({
      success: false,
      code: "LESSON_QUESTION_NOT_FOUND",
    });
    await mount();
    await set(boxIn(cards()[0]), "Cevap");
    await click(buttonIn(cards()[0], tr.answerAction) as Element);
    await settle();
    expect(cards()[0].textContent).toContain(tr.errors.gone);
    expect(boxIn(cards()[0]).value).toBe("Cevap");
  });

  it("keeps the text and says it failed when the send fails", async () => {
    state.questions = page([question("Birinci")]);
    answerQuestion.mockRejectedValue(new Error("down"));
    await mount();
    await set(boxIn(cards()[0]), "Cevap");
    await click(buttonIn(cards()[0], tr.answerAction) as Element);
    await settle();
    expect(cards()[0].textContent).toContain(tr.errors.failed);
    expect(boxIn(cards()[0]).value).toBe("Cevap");
  });
});

describe("paging", () => {
  it("asks for the next page with the cursor and appends it, until there is none", async () => {
    state.questions = page([question("Birinci")], "cursor-1");
    loadQuestions
      .mockResolvedValueOnce(
        ok({ items: [question("İkinci")], nextCursor: "cursor-2" })
      )
      .mockResolvedValueOnce(
        ok({ items: [question("Üçüncü")], nextCursor: null })
      );
    await mount();
    expect(cards()).toHaveLength(1);

    await click(buttonIn(document.body, tr.loadMore) as Element);
    await settle();
    expect(loadQuestions).toHaveBeenLastCalledWith(COURSE_ID, "cursor-1");
    expect(cards()).toHaveLength(2);
    expect(buttonIn(document.body, tr.loadMore)).toBeDefined();

    await click(buttonIn(document.body, tr.loadMore) as Element);
    await settle();
    expect(loadQuestions).toHaveBeenLastCalledWith(COURSE_ID, "cursor-2");
    expect(cards().map((card) => card.textContent)).toEqual([
      expect.stringContaining("Birinci"),
      expect.stringContaining("İkinci"),
      expect.stringContaining("Üçüncü"),
    ]);
    expect(buttonIn(document.body, tr.loadMore)).toBeUndefined();
  });

  it("offers no button when the first page is the last", async () => {
    state.questions = page([question("Tek")]);
    await mount();
    expect(buttonIn(document.body, tr.loadMore)).toBeUndefined();
  });

  it("says so when the next page fails, keeps what is shown, and tries again", async () => {
    state.questions = page([question("Birinci")], "cursor-1");
    loadQuestions
      .mockResolvedValueOnce({ success: false, code: "X" })
      .mockResolvedValueOnce(
        ok({ items: [question("İkinci")], nextCursor: null })
      );
    await mount();
    await click(buttonIn(document.body, tr.loadMore) as Element);
    await settle();
    expect(document.body.textContent).toContain(tr.loadMoreFailed);
    expect(cards()).toHaveLength(1);

    await click(buttonIn(document.body, tr.loadMore) as Element);
    await settle();
    expect(document.body.textContent).not.toContain(tr.loadMoreFailed);
    expect(cards()).toHaveLength(2);
  });

  it("shows a question once when a later page reaches one already shown", () => {
    expect(
      appendQuestions([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }])
    ).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
  });
});

describe("the rules", () => {
  it("writes a time in the viewer's zone", () => {
    const at = new Date("2026-10-03T21:30:00Z");
    expect(questionWhen(at, "tr", "Europe/Istanbul")).toContain("00:30");
    expect(questionWhen(at, "tr", "America/New_York")).toContain("17:30");
  });

  it("words a refused answer from the code the API sent", () => {
    expect(answerErrorKey("LESSON_QUESTION_NOT_FOUND")).toBe(
      "Questions.errors.gone"
    );
    expect(answerErrorKey("VALIDATION_ERROR")).toBe("Questions.errors.invalid");
    expect(answerErrorKey("AUTHZ_FORBIDDEN")).toBe("Problems.actionForbidden");
    expect(answerErrorKey("")).toBe("Questions.errors.failed");
    for (const key of [
      answerErrorKey("LESSON_QUESTION_NOT_FOUND"),
      answerErrorKey("VALIDATION_ERROR"),
      answerErrorKey("AUTHZ_FORBIDDEN"),
      answerErrorKey("SOMETHING_NEW"),
    ]) {
      expect(translatorFor("nazar").has(key), key).toBe(true);
    }
  });
});

describe("the route", () => {
  it("opens the page of the course in the address, and 404s an address that is no id", async () => {
    const route = await import("../app/ders/[dersId]/sorular/page");
    const opened = await route.default({
      params: Promise.resolve({ dersId: COURSE_ID }),
    });
    expect((opened as ReactElement<{ courseId: string }>).props.courseId).toBe(
      COURSE_ID
    );
    await expect(
      route.default({ params: Promise.resolve({ dersId: "nope" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
