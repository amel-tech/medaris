import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `listMyLessonQuestions` (MDRS-285): the watch page's "Soru sor" lists the
 * talebe's own questions on one celse, and the API lists them per course
 * only, a page at a time. The action reads the course's list to its end and
 * keeps this celse's.
 */

const listMyCourseQuestions = vi.fn();

vi.mock("~/lib/authenticated-action", () => ({
  authenticatedAction: async <T>(
    action: (api: unknown) => Promise<T>
  ): Promise<{ success: true; data: T }> => ({
    success: true,
    data: await action({ lessons: { listMyCourseQuestions } }),
  }),
}));

const q = (id: string, lessonId: string) => ({ id, lessonId, body: id });

beforeEach(() => listMyCourseQuestions.mockReset());

describe("listMyLessonQuestions", () => {
  it("reads every page of the course, the largest at a time, and keeps this celse's, newest first", async () => {
    listMyCourseQuestions
      .mockResolvedValueOnce({
        items: [q("q5", "s1"), q("q4", "s2"), q("q3", "s1")],
        nextCursor: "p2",
      })
      .mockResolvedValueOnce({
        items: [q("q2", "s3"), q("q1", "s1")],
        nextCursor: null,
      });
    const { listMyLessonQuestions } = await import(
      "~/features/courses/actions/questions"
    );
    const result = await listMyLessonQuestions("c1", "s1");
    expect(result).toEqual({
      success: true,
      data: [q("q5", "s1"), q("q3", "s1"), q("q1", "s1")],
    });
    expect(listMyCourseQuestions.mock.calls).toEqual([
      [{ id: "c1", limit: 50, cursor: undefined }],
      [{ id: "c1", limit: 50, cursor: "p2" }],
    ]);
  });

  it("stops after twenty pages of a cursor that never ends", async () => {
    listMyCourseQuestions.mockResolvedValue({
      items: [q("q", "s1")],
      nextCursor: "again",
    });
    const { listMyLessonQuestions } = await import(
      "~/features/courses/actions/questions"
    );
    const result = await listMyLessonQuestions("c1", "s1");
    expect(listMyCourseQuestions).toHaveBeenCalledTimes(20);
    expect(result.success && result.data).toHaveLength(20);
  });
});
