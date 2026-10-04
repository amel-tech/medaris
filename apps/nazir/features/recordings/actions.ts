"use server";

import type { RecordingResponse } from "@medaris/services/tedrisat";
import {
  type ActionOutcome,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";

/**
 * Ders kayıtları: each write is one call of tedrisat's recording endpoints. A
 * recording is a pasted link; nothing is uploaded and no host is called. A
 * refusal is its code and the page words it; the server's message never
 * reaches the browser.
 */

/** "Kaydı ekle" (`POST /lessons/:id/recordings`): the recording of one session, READY at once. */
export async function addRecording(
  lessonId: string,
  body: {
    title: string;
    url: string;
    visibility: RecordingResponse["visibility"];
  }
): Promise<ActionOutcome<{ id: string }>> {
  const result = await authenticatedAction(async (api) => {
    const { id } = await api.lessons.createLessonRecording({
      id: lessonId,
      createRecordingDto: body,
    });
    return { id };
  });
  if (!result.success) console.error("Error adding a recording:", result.error);
  return outcomeOf(result);
}

/** "Kaydet" on a recording (`PATCH /recordings/:id`): only the keys sent change. */
export async function changeRecording(
  recordingId: string,
  body: {
    title?: string;
    url?: string;
    visibility?: RecordingResponse["visibility"];
  }
): Promise<ActionOutcome<{ id: string }>> {
  const result = await authenticatedAction(async (api) => {
    const { id } = await api.lessons.updateRecording({
      id: recordingId,
      updateRecordingDto: body,
    });
    return { id };
  });
  if (!result.success)
    console.error("Error changing a recording:", result.error);
  return outcomeOf(result);
}
