"use server";

import type {
  EvaluationMarkResponse,
  EvaluationStatus,
  ExamReleaseResponse,
  ExamResultResponse,
} from "@medaris/services/tedrisat";
import {
  type ActionOutcome,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";

/**
 * A mark on "Değerlendirme" (`PUT /lessons/:id/evaluations/:userId`):
 * "Tam", "Eksik" or "Vermedi" with an optional short note, replacing an
 * earlier mark. `session.manage` on the course; tedrisat writes it to the
 * audit log. A blank note is none.
 */
export async function saveEvaluation(
  lessonId: string,
  userId: string,
  status: EvaluationStatus,
  note: string | null
): Promise<ActionOutcome<EvaluationMarkResponse>> {
  const result = await authenticatedAction((api) =>
    api.evaluations.saveEvaluation({
      id: lessonId,
      userId,
      saveEvaluationDto: { status, note },
    })
  );
  if (!result.success) {
    console.error("Error saving a mark:", result.error);
  }
  return outcomeOf(result);
}

/**
 * An exam result on "Değerlendirme" (`PUT /lessons/:id/exam-results/:userId`,
 * MDRS-248): a score up to "tam puan", or "Girmedi". tedrisat refuses a score
 * above it (EXAM_SCORE_OUT_OF_RANGE) as the box does.
 */
export async function saveExamResult(
  lessonId: string,
  userId: string,
  entry: { score: number } | { absent: true }
): Promise<ActionOutcome<ExamResultResponse>> {
  const result = await authenticatedAction((api) =>
    api.exams.saveExamResult({
      id: lessonId,
      userId,
      saveExamResultDto:
        "absent" in entry
          ? { absent: true, score: null }
          : { absent: false, score: entry.score },
    })
  );
  if (!result.success) {
    console.error("Error saving an exam result:", result.error);
  }
  return outcomeOf(result);
}

/** "Sonuçları talebelere aç" (`POST /lessons/:id/exam-results/release`). */
export async function releaseExamResults(
  lessonId: string
): Promise<ActionOutcome<ExamReleaseResponse>> {
  const result = await authenticatedAction((api) =>
    api.exams.releaseExamResults({ id: lessonId })
  );
  if (!result.success) {
    console.error("Error releasing exam results:", result.error);
  }
  return outcomeOf(result);
}
