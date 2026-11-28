"use server";

import type { Unauthenticated } from "@medaris/auth/server";
import type { BabKey, MasdarVezin } from "@medaris/sarf";
import {
  type ActionOutcome,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";

/**
 * A course's sarf page: the roots its müderris chose. Each write is one call
 * of tedrisat's `sarf-roots` endpoints with the caller's token; the API
 * decides it (`course.edit`). The tables are written from a root in the
 * browser, so nothing derived is sent.
 */

export type SarfRootOutcome = ActionOutcome<{ id: string }> | Unauthenticated;

export interface SarfRootBody {
  /** Three letters, a space between: `ن ص ر`. */
  kok: string;
  bab: BabKey;
  mastar: string | null;
  masdarVezin: MasdarVezin;
}

/** "Derse ekle" (`PUT /courses/:id/sarf-roots`): adds the root, or changes it. */
export async function saveSarfRoot(
  courseId: string,
  body: SarfRootBody
): Promise<SarfRootOutcome> {
  const result = await authenticatedAction(async (api) => {
    const { id } = await api.courses.saveCourseSarfRoot({
      id: courseId,
      saveCourseSarfRootDto: body,
    });
    return { id };
  });
  if (!result.success) console.error("Error saving a sarf root:", result.error);
  return outcomeOf(result);
}

/** "Dersten kaldır" (`DELETE /courses/:id/sarf-roots/:rootId`). */
export async function deleteSarfRoot(
  courseId: string,
  rootId: string
): Promise<SarfRootOutcome> {
  const result = await authenticatedAction(async (api) => {
    await api.courses.deleteCourseSarfRoot({ id: courseId, rootId });
    return { id: rootId };
  });
  if (!result.success)
    console.error("Error removing a sarf root:", result.error);
  return outcomeOf(result);
}
