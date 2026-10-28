"use server";

import {
  type ActionOutcome,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";

/**
 * "İtiraz aç" → "Gönder" (`POST /madrasahs/:id/appeals`): the medrese appeals
 * a köşk's refusal of its course request. A refusal is its code
 * (APPEAL_EXISTS, APPEAL_REQUEST_NOT_REJECTED, …) and the page words it.
 */
export async function openAppeal(
  madrasahId: string,
  courseRequestId: string,
  reason: string
): Promise<ActionOutcome<null>> {
  const result = await authenticatedAction(async (api) => {
    await api.madrasahs.createMadrasahAppeal({
      id: madrasahId,
      createAppealDto: { courseRequestId, reason },
    });
    return null;
  });
  if (!result.success) console.error("Error opening an appeal:", result.error);
  return outcomeOf(result);
}
