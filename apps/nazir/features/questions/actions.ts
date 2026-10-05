"use server";

import type {
  CourseQuestionResponse,
  PaginatedCourseQuestionResponse,
} from "@medaris/services/tedrisat";
import {
  type ActionOutcome,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";

/**
 * "Daha fazla göster" of Sorular (`GET /courses/:id/questions`): the page
 * after the one the cursor came with. The API lists the questions to whoever
 * holds `question.answer` in the course and refuses everyone else.
 */
export async function loadQuestions(
  courseId: string,
  cursor: string
): Promise<ActionOutcome<PaginatedCourseQuestionResponse>> {
  const result = await authenticatedAction((api) =>
    api.lessons.listCourseQuestions({ id: courseId, cursor })
  );
  if (!result.success) {
    console.error("Error reading more questions:", result.error);
  }
  return outcomeOf(result);
}

/**
 * "Cevapla" and "Kaydet" (`PUT /questions/:id/answer`): sets the answer, or
 * replaces the earlier one. A refusal is its code and the page words it; the
 * API answers 404 both for a question that is gone and for one the caller may
 * not answer.
 */
export async function answerQuestion(
  questionId: string,
  body: string
): Promise<ActionOutcome<CourseQuestionResponse>> {
  const result = await authenticatedAction((api) =>
    api.lessons.answerLessonQuestion({
      questionId,
      answerLessonQuestionDto: { body },
    })
  );
  if (!result.success)
    console.error("Error answering a question:", result.error);
  return outcomeOf(result);
}
