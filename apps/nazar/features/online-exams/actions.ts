"use server";

import type {
  CourseTopicResponse,
  ExamQuestionWriteResponse,
  OnlineExamDraftResponse,
  SaveExamQuestionDto,
} from "@medaris/services/tedrisat";
import {
  type ActionOutcome,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";

/**
 * Preparing online exams (MDRS-299): each write is one call of tedrisat. A
 * question write names the version the page holds; a 409 EXAM_STALE means
 * someone else saved the exam since, and the page reads it again.
 */

export async function createOnlineExam(
  courseId: string,
  title: string
): Promise<ActionOutcome<{ id: string }>> {
  return outcomeOf(
    await authenticatedAction((api) =>
      api.onlineExams.createOnlineExam({
        id: courseId,
        createOnlineExamDto: { title },
      })
    )
  );
}

export async function createCourseTopic(
  courseId: string,
  name: string,
  number?: number
): Promise<ActionOutcome<CourseTopicResponse>> {
  return outcomeOf(
    await authenticatedAction((api) =>
      api.onlineExams.createCourseTopic({
        id: courseId,
        createCourseTopicDto:
          number === undefined ? { name } : { name, number },
      })
    )
  );
}

export async function addExamQuestion(
  examId: string,
  version: number
): Promise<ActionOutcome<ExamQuestionWriteResponse>> {
  return outcomeOf(
    await authenticatedAction((api) =>
      api.onlineExams.addExamQuestion({ examId, versionDto: { version } })
    )
  );
}

export async function saveExamQuestion(
  examId: string,
  questionId: string,
  question: SaveExamQuestionDto
): Promise<ActionOutcome<ExamQuestionWriteResponse>> {
  return outcomeOf(
    await authenticatedAction((api) =>
      api.onlineExams.saveExamQuestion({
        examId,
        questionId,
        saveExamQuestionDto: question,
      })
    )
  );
}

export async function removeExamQuestion(
  examId: string,
  questionId: string,
  version: number
): Promise<ActionOutcome<{ version: number }>> {
  return outcomeOf(
    await authenticatedAction((api) =>
      api.onlineExams.removeExamQuestion({ examId, questionId, version })
    )
  );
}

/**
 * "Yayınla": `startsAt` left out opens it now; `latestStartAt` left out is
 * the start plus ten minutes. Both are ISO instants. The answer is the exam
 * as it now stands, published.
 */
export async function publishOnlineExam(
  examId: string,
  input: { version: number; startsAt?: string; latestStartAt?: string }
): Promise<ActionOutcome<OnlineExamDraftResponse>> {
  return outcomeOf(
    await authenticatedAction((api) =>
      api.onlineExams.publishOnlineExam({
        examId,
        publishOnlineExamDto: {
          version: input.version,
          ...(input.startsAt ? { startsAt: new Date(input.startsAt) } : {}),
          ...(input.latestStartAt
            ? { latestStartAt: new Date(input.latestStartAt) }
            : {}),
        },
      })
    )
  );
}

/** "Taslağa al", until it opens: the answer is the exam, a draft again. */
export async function unpublishOnlineExam(
  examId: string,
  version: number
): Promise<ActionOutcome<OnlineExamDraftResponse>> {
  return outcomeOf(
    await authenticatedAction((api) =>
      api.onlineExams.unpublishOnlineExam({
        examId,
        versionDto: { version },
      })
    )
  );
}
