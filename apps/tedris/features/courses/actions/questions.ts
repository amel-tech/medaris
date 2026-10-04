"use server";

import type {
  LessonQuestionResponse,
  PaginatedLessonQuestionResponse,
} from "@medaris/services/tedrisat";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";

/**
 * A talebe's questions to the course staff (MDRS-150). The API returns a
 * question to its author alone here, so these four are the whole surface of
 * tedris: the staff read and answer the questions in the nazir app. Nothing
 * is revalidated: the tab keeps its own list.
 */

/** One page of the caller's own questions; `cursor` is the previous page's `nextCursor`. */
export const listMyCourseQuestions = async (
  courseId: string,
  cursor?: string
): Promise<AuthenticatedActionResult<PaginatedLessonQuestionResponse>> =>
  authenticatedAction((api) =>
    api.lessons.listMyCourseQuestions({ id: courseId, cursor })
  );

export const askLessonQuestion = async (
  lessonId: string,
  body: string
): Promise<AuthenticatedActionResult<LessonQuestionResponse>> =>
  authenticatedAction((api) =>
    api.lessons.askLessonQuestion({
      id: lessonId,
      askLessonQuestionDto: { body },
    })
  );

/** The API refuses an answered question with 409. */
export const updateLessonQuestion = async (
  questionId: string,
  body: string
): Promise<AuthenticatedActionResult<LessonQuestionResponse>> =>
  authenticatedAction((api) =>
    api.lessons.updateLessonQuestion({
      questionId,
      updateLessonQuestionDto: { body },
    })
  );

/** Removes the question and its answer. */
export const deleteLessonQuestion = async (
  questionId: string
): Promise<AuthenticatedActionResult<void>> =>
  authenticatedAction((api) =>
    api.lessons.deleteLessonQuestion({ questionId })
  );
