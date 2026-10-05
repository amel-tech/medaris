"use server";

import type { RecordingResponse } from "@medaris/services/tedrisat";
import {
  type ActionOutcome,
  type AuthenticatedActionResult,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";
import { refusalReasonOf } from "./recordings";

/**
 * Ders kayıtları: each write is one call of tedrisat's recording endpoints. A
 * recording is a pasted link; nothing is uploaded and no host is called. A
 * refusal is its code, and for a link tedrisat cannot store the reason it
 * names (`RECORDING_LINK_INVALID`), and the page words it; the server's
 * message never reaches the browser.
 */

/** A write's outcome: `outcomeOf`'s, with the refusal's reason when it gave one. */
export type RecordingOutcome =
  | Extract<ActionOutcome<{ id: string }>, { success: true }>
  | { success: false; code: string; reason?: string };

const recordingOutcomeOf = (
  result: AuthenticatedActionResult<{ id: string }>
): RecordingOutcome => {
  const outcome = outcomeOf(result);
  const reason = result.success ? null : refusalReasonOf(result.errorBody);
  return outcome.success || reason === null ? outcome : { ...outcome, reason };
};

/** "Kaydı ekle" (`POST /lessons/:id/recordings`): the recording of one session, READY at once. */
export async function addRecording(
  lessonId: string,
  body: {
    title: string;
    url: string;
    visibility: RecordingResponse["visibility"];
  }
): Promise<RecordingOutcome> {
  const result = await authenticatedAction(async (api) => {
    const { id } = await api.lessons.createLessonRecording({
      id: lessonId,
      createRecordingDto: body,
    });
    return { id };
  });
  if (!result.success) console.error("Error adding a recording:", result.error);
  return recordingOutcomeOf(result);
}

/** "Kaydet" on a recording (`PATCH /recordings/:id`): only the keys sent change. */
export async function changeRecording(
  recordingId: string,
  body: {
    title?: string;
    url?: string;
    visibility?: RecordingResponse["visibility"];
  }
): Promise<RecordingOutcome> {
  const result = await authenticatedAction(async (api) => {
    const { id } = await api.lessons.updateRecording({
      id: recordingId,
      updateRecordingDto: body,
    });
    return { id };
  });
  if (!result.success)
    console.error("Error changing a recording:", result.error);
  return recordingOutcomeOf(result);
}
