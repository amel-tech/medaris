"use server";

import type { UpdateMadrasahSettingsDto } from "@medaris/services/tedrisat";
import {
  type ActionOutcome,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";
import { type SettingsSnapshot, snapshotOf } from "./settings";

/**
 * "Kaydet" of nazir 04 (`PATCH /madrasahs/:id/settings`): only the fields in
 * `patch` change, and the answer is the state the API now holds, with who saved
 * and when. A save that changes nothing leaves "Son değişiklik" alone.
 */
export async function saveSettings(
  madrasahId: string,
  patch: UpdateMadrasahSettingsDto
): Promise<ActionOutcome<SettingsSnapshot>> {
  const result = await authenticatedAction(async (api) =>
    snapshotOf(
      await api.madrasahs.updateMadrasahSettings({
        id: madrasahId,
        updateMadrasahSettingsDto: patch,
      })
    )
  );
  if (!result.success)
    console.error("Error saving the settings:", result.error);
  return outcomeOf(result);
}
