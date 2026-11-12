"use server";

import type {
  EvaluationMarkResponse,
  EvaluationStatus,
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
