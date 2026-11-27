"use server";

import type {
  PracticeAnswerSavedResponse,
  PracticeAttemptResponse,
} from "@medaris/services/tedrisat";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";

/**
 * A talebe solving a çalışma seti (MDRS-248, Faz 3). The API answers a
 * caller's own attempt to the caller alone. Nothing is revalidated: the list
 * and the result are read per request.
 */

type Result<T> = Promise<AuthenticatedActionResult<T>>;

/** Starts an attempt, or gives back the one in progress. */
export const startPractice = async (
  setId: string
): Result<PracticeAttemptResponse> =>
  authenticatedAction((api) => api.practice.startPracticeAttempt({ setId }));

/** Starts a pool attempt of the course (MDRS-248, Faz 4), or gives back the one in progress. */
export const startPracticePool = async (
  courseId: string,
  mode: "ALL" | "RANDOM",
  count?: number
): Result<PracticeAttemptResponse> =>
  authenticatedAction((api) =>
    api.practice.startPracticePoolAttempt({
      id: courseId,
      startPracticePoolDto: mode === "RANDOM" ? { mode, count } : { mode },
    })
  );

export const savePracticeChoice = async (
  attemptId: string,
  questionId: string,
  optionIds: string[]
): Result<PracticeAnswerSavedResponse> =>
  authenticatedAction((api) =>
    api.practice.savePracticeAnswer({
      attemptId,
      questionId,
      savePracticeAnswerDto: { optionIds },
    })
  );

export const finishPractice = async (
  attemptId: string
): Result<PracticeAttemptResponse> =>
  authenticatedAction((api) =>
    api.practice.finishPracticeAttempt({ attemptId })
  );
