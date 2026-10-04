import type { CourseDetailResponse } from "@medaris/services/tedrisat";
import { describe, expect, it } from "vitest";
import {
  appendQuestions,
  canEditQuestion,
  QUESTION_BODY_MAX,
  questionWhen,
  sessionChoices,
} from "~/features/courses/question-model";

const course = {
  weeks: [
    {
      weekNumber: 1,
      lessons: [
        { id: "a", title: "Birinci", cancelledAt: null },
        { id: "b", title: "İptal", cancelledAt: new Date("2026-10-01") },
      ],
    },
    { weekNumber: 2, lessons: [{ id: "c", title: "Üçüncü" }] },
  ],
} as unknown as Pick<CourseDetailResponse, "weeks">;

describe("the question limits and lists (MDRS-150)", () => {
  it("matches the API's limit on a question", () => {
    expect(QUESTION_BODY_MAX).toBe(4000);
  });

  it("lists the sessions in programme order, with their week, cancelled ones left out", () => {
    expect(sessionChoices(course)).toEqual([
      { id: "a", weekNumber: 1, title: "Birinci" },
      { id: "c", weekNumber: 2, title: "Üçüncü" },
    ]);
  });

  it("lets the author edit a question only while it has no answer", () => {
    expect(canEditQuestion({ answer: null })).toBe(true);
    expect(canEditQuestion({ answer: { body: "x" } })).toBe(false);
  });

  it("appends a page without repeating a question already shown", () => {
    expect(
      appendQuestions([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }])
    ).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect(appendQuestions([], [{ id: "a" }])).toEqual([{ id: "a" }]);
  });

  it("writes a time in the course's zone, not the reader's", () => {
    const at = new Date("2026-10-03T21:30:00Z");
    expect(questionWhen(at, "tr", "Europe/Istanbul")).toContain("00:30");
    expect(questionWhen(at, "tr", "Europe/Istanbul")).toContain("4 Eki");
    expect(questionWhen(at, "tr", "America/New_York")).toContain("17:30");
  });
});
