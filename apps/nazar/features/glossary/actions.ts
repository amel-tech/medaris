"use server";

import type { Unauthenticated } from "@medaris/auth/server";
import {
  type ActionOutcome,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";

/**
 * A course's glossary: each write is one call of tedrisat's `terms` endpoints
 * with the caller's token. A refusal is its code; the page words it. The API
 * decides every write (`course.edit`).
 */

export type TermOutcome = ActionOutcome<{ id: string }> | Unauthenticated;

export interface TermBody {
  term: string;
  arabic: string | null;
  lexicalMeaning: string | null;
  technicalMeaning: string | null;
  example: string | null;
}

/** "Terim ekle" (`POST /courses/:id/terms`). */
export async function createTerm(
  courseId: string,
  body: TermBody
): Promise<TermOutcome> {
  const result = await authenticatedAction(async (api) => {
    const { id } = await api.courses.createCourseTerm({
      id: courseId,
      createCourseTermDto: body,
    });
    return { id };
  });
  if (!result.success) console.error("Error adding a term:", result.error);
  return outcomeOf(result);
}

/** "Kaydet" on a term (`PATCH /courses/:id/terms/:termId`). */
export async function updateTerm(
  courseId: string,
  termId: string,
  body: TermBody
): Promise<TermOutcome> {
  const result = await authenticatedAction(async (api) => {
    const { id } = await api.courses.updateCourseTerm({
      id: courseId,
      termId,
      updateCourseTermDto: body,
    });
    return { id };
  });
  if (!result.success) console.error("Error changing a term:", result.error);
  return outcomeOf(result);
}

/** "Sil" on a term (`DELETE /courses/:id/terms/:termId`). */
export async function deleteTerm(
  courseId: string,
  termId: string
): Promise<TermOutcome> {
  const result = await authenticatedAction(async (api) => {
    await api.courses.deleteCourseTerm({ id: courseId, termId });
    return { id: termId };
  });
  if (!result.success) console.error("Error deleting a term:", result.error);
  return outcomeOf(result);
}
