"use server";

import type { UpdateMadrasahSettingsDto } from "@medaris/services/tedrisat";
import {
  type ActionOutcome,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";
import { type SettingsSnapshot, snapshotOf } from "./settings";
import { type ZerothSaved, zerothOf } from "./zeroth-question";

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

/**
 * Kaydet of "Sınavların sıfırıncı sorusu" (`PUT /madrasahs/:id/exam-zeroth-
 * question`, MDRS-299): the whole question replaces the one before; the
 * answer is what the API now holds. The exams already published keep theirs.
 */
export async function saveZerothQuestion(
  madrasahId: string,
  body: { text: string; options: string[] }
): Promise<ActionOutcome<ZerothSaved>> {
  const result = await authenticatedAction(async (api) =>
    zerothOf(
      await api.onlineExams.saveMadrasahZerothQuestion({
        id: madrasahId,
        saveZerothQuestionDto: body,
      })
    )
  );
  if (!result.success)
    console.error("Error saving the zeroth question:", result.error);
  return outcomeOf(result);
}
