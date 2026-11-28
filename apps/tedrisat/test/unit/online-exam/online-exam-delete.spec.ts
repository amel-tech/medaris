import type { AuthenticatedUser } from "@medaris/common";
import { describe, expect, it, vi } from "vitest";
import type { CourseService } from "../../../src/course/course.service";
import {
  ExamLockedError,
  OnlineExamNotFoundError,
} from "../../../src/online-exam/errors/online-exam.errors";
import type { OnlineExamRepository } from "../../../src/online-exam/online-exam.repository";
import { OnlineExamService } from "../../../src/online-exam/online-exam.service";
import type { ZerothQuestionRepository } from "../../../src/online-exam/zeroth-question.repository";
import type { QuestionNoteRepository } from "../../../src/question-note/question-note.repository";

const user = { sub: "u-1" } as AuthenticatedUser;

const serviceOf = (
  courseId: string | null,
  deletePractice: () => Promise<void> = async () => undefined
) => {
  const repo = {
    findExamCourseId: vi.fn(async () => courseId),
    deletePractice: vi.fn(deletePractice),
  };
  const courses = { getDetail: vi.fn(async () => ({})) };
  const service = new OnlineExamService(
    repo as unknown as OnlineExamRepository,
    courses as unknown as CourseService,
    {} as ZerothQuestionRepository,
    {} as QuestionNoteRepository
  );
  return { service, repo, courses };
};

/** "Seti sil" (MDRS-248): the set's course is checked first, then the repository decides. */
describe("OnlineExamService.deleteExam", () => {
  it("deletes in the set's own course, as the caller", async () => {
    const { service, repo, courses } = serviceOf("c-1");
    await service.deleteExam("e-1", user);
    expect(courses.getDetail).toHaveBeenCalledWith("c-1", user);
    expect(repo.deletePractice).toHaveBeenCalledWith("c-1", "e-1", "u-1");
  });

  it("is EXAM_NOT_FOUND for a set that is not there, and deletes nothing", async () => {
    const { service, repo } = serviceOf(null);
    await expect(service.deleteExam("e-1", user)).rejects.toBeInstanceOf(
      OnlineExamNotFoundError
    );
    expect(repo.deletePractice).not.toHaveBeenCalled();
  });

  it("passes the repository's refusal on", async () => {
    const { service } = serviceOf("c-1", async () => {
      throw new ExamLockedError("e-1");
    });
    await expect(service.deleteExam("e-1", user)).rejects.toBeInstanceOf(
      ExamLockedError
    );
  });
});
