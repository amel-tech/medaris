"use server";

import type {
  OnlineExamClosedResponse,
  OnlineExamResultsResponse,
} from "@medaris/services/tedrisat";
import {
  type ActionOutcome,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";

/**
 * The team's side of a published online exam (MDRS-299): its results, read
 * again while it is open, and "Sınavı erken bitir". Releasing the results is
 * Değerlendirme's own `releaseExamResults`.
 */

export async function readExamResults(
  examId: string
): Promise<ActionOutcome<OnlineExamResultsResponse>> {
  return outcomeOf(
    await authenticatedAction((api) =>
      api.onlineExams.getOnlineExamResults({ examId })
    )
  );
}

export async function closeExamEarly(
  examId: string
): Promise<ActionOutcome<OnlineExamClosedResponse>> {
  return outcomeOf(
    await authenticatedAction((api) =>
      api.onlineExams.closeOnlineExamEarly({ examId })
    )
  );
}
