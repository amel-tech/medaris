"use server";

import {
  type ActionOutcome,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";

/**
 * "Geri al" (`POST /archive/:type/:id/restore`): the API decides by kademe, so
 * a refusal is its code (ARCHIVE_FORBIDDEN, ARCHIVE_RESTORE_LEVEL,
 * ARCHIVE_ITEM_NOT_FOUND, ARCHIVE_PARENT_HIDDEN) and the page words it.
 */
export async function restoreItem(
  type: string,
  id: string
): Promise<ActionOutcome<{ title: string }>> {
  const result = await authenticatedAction(async (api) => {
    const { title } = await api.archive.restoreArchiveItem({ type, id });
    return { title };
  });
  if (!result.success)
    console.error("Error bringing an item back:", result.error);
  return outcomeOf(result);
}

/** "Medreseyi gizle" (`POST /madrasahs/:id/hide`): the medrese and its shown courses together; nothing is deleted. */
export async function hideMedrese(
  madrasahId: string
): Promise<ActionOutcome<null>> {
  const result = await authenticatedAction(async (api) => {
    await api.madrasahs.hideMadrasah({ id: madrasahId });
    return null;
  });
  if (!result.success) console.error("Error hiding the medrese:", result.error);
  return outcomeOf(result);
}
