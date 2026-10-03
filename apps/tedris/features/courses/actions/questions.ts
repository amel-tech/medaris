"use server";

import type {
  CourseQuestionResponse,
  LessonQuestionResponse,
} from "@medaris/services/tedrisat";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";

/**
 * A talebe's questions to the course staff (MDRS-150). The API returns a
 * question to its author and to whoever holds `question.answer` in the course,
 * so these four are the whole surface: no action reads another talebe's
 * question. Nothing is revalidated: both views keep their own list.
 */

export const listMyCourseQuestions = async (
  courseId: string
): Promise<AuthenticatedActionResult<LessonQuestionResponse[]>> =>
  authenticatedAction((api) =>
    api.lessons.listMyCourseQuestions({ id: courseId })
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

export const answerLessonQuestion = async (
  questionId: string,
  body: string
): Promise<AuthenticatedActionResult<CourseQuestionResponse>> =>
  authenticatedAction((api) =>
    api.lessons.answerLessonQuestion({
      questionId,
      answerLessonQuestionDto: { body },
    })
  );
