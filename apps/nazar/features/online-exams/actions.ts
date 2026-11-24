"use server";

import {
  isUnauthenticated,
  type Unauthenticated,
  unauthenticated,
} from "@medaris/auth/server";
import type {
  CourseTopicResponse,
  CourseZerothQuestionResponse,
  ExamPointsResponse,
  ExamQuestionWriteResponse,
  OnlineExamDraftResponse,
  SaveExamQuestionDto,
  TopicRemovedResponse,
} from "@medaris/services/tedrisat";
import {
  type ActionOutcome,
  authenticatedAction,
  errorCodeOf,
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

/** The exam's settings: its title, its length in minutes (null until typed) and the team's instructions (blank is none). */
export interface ExamSettings {
  title: string;
  durationMinutes: number | null;
  instructions: string | null;
}

/** Saves the settings of a draft (`PATCH /online-exams/:examId`), naming the version the page holds. */
export async function saveExamSettings(
  examId: string,
  settings: ExamSettings & { version: number }
): Promise<ActionOutcome<{ version: number }>> {
  return outcomeOf(
    await authenticatedAction((api) =>
      api.onlineExams.updateOnlineExam({
        examId,
        updateOnlineExamDto: settings,
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
  input: {
    version: number;
    startsAt?: string;
    latestStartAt?: string;
    latestStartMinutes?: number;
  }
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
          ...(input.latestStartMinutes !== undefined
            ? { latestStartMinutes: input.latestStartMinutes }
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

/** A points write's answer; POINTS_OVER_TOTAL carries how many are left to give ("60.00"). */
export type PointsOutcome =
  | { success: true; data: ExamPointsResponse }
  | { success: false; code: string; pointsLeft?: string }
  | Unauthenticated;

/** A question's own points ("12.50"), or null to put it back into the equal share. */
export async function setExamQuestionPoints(
  examId: string,
  questionId: string,
  version: number,
  points: string | null
): Promise<PointsOutcome> {
  const result = await authenticatedAction((api) =>
    api.onlineExams.setExamQuestionPoints({
      examId,
      questionId,
      setQuestionPointsDto: { version, points },
    })
  );
  if (isUnauthenticated(result))
    return unauthenticated({ reauth: result.reauth });
  if (result.success) return result;
  const left = (result.errorBody as { context?: { pointsLeft?: unknown } })
    ?.context?.pointsLeft;
  return {
    success: false,
    code: errorCodeOf(result.errorBody),
    ...(typeof left === "string" ? { pointsLeft: left } : {}),
  };
}

/** A question that carries a topic, as TOPIC_IN_USE names it. */
export interface TopicCarrier {
  examId: string;
  examTitle: string;
  number: number;
}

/**
 * A topic removal's answer: the exams whose pick it took off, with their new
 * versions; TOPIC_IN_USE names the questions that carry it.
 */
export type TopicRemovalOutcome =
  | { success: true; data: TopicRemovedResponse }
  | { success: false; code: string; questions?: TopicCarrier[] }
  | Unauthenticated;

/** Deletes a topic from the course's list (`DELETE /courses/:id/exam-topics/:topicId`). */
export async function removeCourseTopic(
  courseId: string,
  topicId: string
): Promise<TopicRemovalOutcome> {
  const result = await authenticatedAction((api) =>
    api.onlineExams.removeCourseTopic({ id: courseId, topicId })
  );
  if (isUnauthenticated(result))
    return unauthenticated({ reauth: result.reauth });
  if (result.success) return { success: true, data: result.data };
  const questions = (result.errorBody as { context?: { questions?: unknown } })
    ?.context?.questions;
  return {
    success: false,
    code: errorCodeOf(result.errorBody),
    ...(Array.isArray(questions)
      ? { questions: questions as TopicCarrier[] }
      : {}),
  };
}

/**
 * Gives the course a zeroth question of its own (MDRS-299), which its exams
 * ask instead of the medrese's from the next one published.
 */
export async function saveCourseZerothQuestion(
  courseId: string,
  body: { text: string; options: string[] }
): Promise<ActionOutcome<CourseZerothQuestionResponse>> {
  return outcomeOf(
    await authenticatedAction((api) =>
      api.onlineExams.saveCourseZerothQuestion({
        id: courseId,
        saveZerothQuestionDto: body,
      })
    )
  );
}

/** Takes the course's own zeroth question off: its exams ask the medrese's again. */
export async function removeCourseZerothQuestion(
  courseId: string
): Promise<ActionOutcome<CourseZerothQuestionResponse>> {
  return outcomeOf(
    await authenticatedAction((api) =>
      api.onlineExams.removeCourseZerothQuestion({ id: courseId })
    )
  );
}
