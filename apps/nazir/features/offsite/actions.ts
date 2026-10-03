"use server";

import type { CreateOffsiteCourseRequestDto } from "@medaris/services/tedrisat";
import {
  type ActionOutcome,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";

/**
 * "Talebi gönder" of nazir 09 (`POST /madrasahs/:id/offsite-course-requests`):
 * the request is recorded for the köşk's nazım and Medaris administration to
 * read; no course is made. A refusal is its code (KOSK_NOT_FOUND,
 * VALIDATION_ERROR, …) and the page words it.
 */
export async function sendOffsiteRequest(
  madrasahId: string,
  request: CreateOffsiteCourseRequestDto
): Promise<ActionOutcome<{ title: string; koskName: string }>> {
  const result = await authenticatedAction(async (api) => {
    const { title, koskName } = await api.madrasahs.requestOffsiteCourse({
      id: madrasahId,
      createOffsiteCourseRequestDto: request,
    });
    return { title, koskName };
  });
  if (!result.success)
    console.error("Error sending an off-medrese course request:", result.error);
  return outcomeOf(result);
}
