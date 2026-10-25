"use server";

import type { CourseSubmissionResponse } from "@medaris/services/tedrisat";
import {
  type ActionOutcome,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";

/**
 * "Değerlendirmeyi gönder" on Ödevler
 * (`PUT /courses/:id/submissions/:submissionId/review`): saves the note,
 * replacing an earlier one, and sends the review with its files to the
 * talebe, who is told. A blank note is none; tedrisat refuses a review with
 * neither a note nor a file (`SUBMISSION_REVIEW_EMPTY`).
 */
export async function sendSubmissionReview(
  courseId: string,
  submissionId: string,
  note: string | null
): Promise<ActionOutcome<CourseSubmissionResponse>> {
  const result = await authenticatedAction((api) =>
    api.submissions.sendSubmissionReview({
      id: courseId,
      submissionId,
      sendSubmissionReviewDto: { note },
    })
  );
  if (!result.success) {
    console.error("Error sending a homework review:", result.error);
  }
  return outcomeOf(result);
}

/** The file goes from storage too; tedrisat writes the removal to the audit log. */
export async function deleteSubmissionReviewFile(
  courseId: string,
  submissionId: string,
  fileId: string
): Promise<ActionOutcome<void>> {
  return outcomeOf(
    await authenticatedAction((api) =>
      api.submissions.deleteSubmissionReviewFile({
        id: courseId,
        submissionId,
        fileId,
      })
    )
  );
}
