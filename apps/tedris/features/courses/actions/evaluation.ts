"use server";

import type { OwnEvaluationResponse } from "@medaris/services/tedrisat";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";

/**
 * The talebe's own mark on a celse's memorisation homework (MDRS-248):
 * "Bekliyor" (`status` null), "Tam", "Eksik" or "Vermedi", with the
 * müderris's note. The API answers a caller about their own mark alone.
 */
export const getMyEvaluation = async (
  lessonId: string
): Promise<AuthenticatedActionResult<OwnEvaluationResponse>> =>
  authenticatedAction((api) =>
    api.evaluations.getMyEvaluation({ id: lessonId })
  );
