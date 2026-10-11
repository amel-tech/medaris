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
 * question to its author alone here, so these are the whole surface of
 * tedris: the staff read and answer the questions in the nazar app. Nothing
 * is revalidated: the tab and the watch page keep their own lists.
 */

/** One page of the caller's own questions; `cursor` is the previous page's `nextCursor`. */
export const listMyCourseQuestions = async (
  courseId: string,
  cursor?: string
): Promise<AuthenticatedActionResult<PaginatedLessonQuestionResponse>> =>
  authenticatedAction((api) =>
    api.lessons.listMyCourseQuestions({ id: courseId, cursor })
  );

/**
 * The caller's own questions on one celse, newest first, with their answers:
 * what the watch page's "Soru sor" panel lists (MDRS-285). The API lists them
 * per course only, so the course's list is read to its end, the API's largest
 * page at a time, and filtered here. The cap only guards against a cursor
 * that never ends: twenty pages are a thousand questions in one course.
 */
export const listMyLessonQuestions = async (
  courseId: string,
  lessonId: string
): Promise<AuthenticatedActionResult<LessonQuestionResponse[]>> =>
  authenticatedAction(async (api) => {
    const mine: LessonQuestionResponse[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const result = await api.lessons.listMyCourseQuestions({
        id: courseId,
        limit: 50,
        cursor,
      });
      mine.push(...result.items.filter((q) => q.lessonId === lessonId));
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }
    return mine;
  });

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
