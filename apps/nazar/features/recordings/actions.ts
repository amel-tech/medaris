"use server";

import type {
  RecordingResponse,
  RecordingUploadResponse,
} from "@medaris/services/tedrisat";
import {
  type ActionOutcome,
  type AuthenticatedActionResult,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";
import type { GrantOutcome, UploadGrant } from "./bunny-upload";
import { refusalReasonOf } from "./recordings";

/**
 * Ders kayıtları: each write is one call of tedrisat's recording endpoints. A
 * recording is a pasted link, or a video the browser sends to Bunny Stream
 * itself: these actions only ask tedrisat to start that upload or to sign it
 * again, and the file never passes through here. A refusal is its code, and
 * for a link tedrisat cannot store or an upload it will not sign again the
 * reason it names (`RECORDING_LINK_INVALID`, `RECORDING_UPLOAD_CLOSED`), and
 * the page words it; the server's message never reaches the browser.
 */

/** A write's outcome: `outcomeOf`'s, with the refusal's reason when it gave one. */
export type RecordingOutcome =
  | Extract<ActionOutcome<{ id: string }>, { success: true }>
  | { success: false; code: string; reason?: string };

const withReason = <T>(
  result: AuthenticatedActionResult<T>
):
  | Extract<ActionOutcome<T>, { success: true }>
  | { success: false; code: string; reason?: string } => {
  const outcome = outcomeOf(result);
  const reason = result.success ? null : refusalReasonOf(result.errorBody);
  return outcome.success || reason === null ? outcome : { ...outcome, reason };
};

const recordingOutcomeOf = (
  result: AuthenticatedActionResult<{ id: string }>
): RecordingOutcome => withReason(result);

/** What the browser's TUS upload needs; the recording's id stays here. */
const grantOf = ({
  endpoint,
  libraryId,
  videoId,
  authorizationExpire,
  authorizationSignature,
}: RecordingUploadResponse): UploadGrant => ({
  endpoint,
  libraryId,
  videoId,
  authorizationExpire,
  authorizationSignature,
});

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

/**
 * "Yükle" (`POST /lessons/:id/recordings/uploads`): tedrisat creates the video
 * in Bunny, records it as the session's PROCESSING recording and signs its
 * upload. A refusal logs the API's message; the answer is never logged.
 */
export async function startRecordingUpload(
  lessonId: string,
  body: {
    title: string;
    visibility: RecordingResponse["visibility"];
    /** ISO time of the session, when it has one */
    recordedAt?: string;
  }
): Promise<GrantOutcome> {
  const result = await authenticatedAction(async (api) =>
    grantOf(
      await api.lessons.startRecordingUpload({
        id: lessonId,
        startRecordingUploadDto: {
          title: body.title,
          visibility: body.visibility,
          ...(body.recordedAt ? { recordedAt: new Date(body.recordedAt) } : {}),
        },
      })
    )
  );
  if (!result.success)
    console.error("Error starting a recording upload:", result.error);
  return withReason(result);
}

/**
 * "Devam et" (`POST /lessons/:id/recordings/uploads/:videoId/signature`): the
 * same video signed again, to continue its upload where it stopped.
 */
export async function resignRecordingUpload(
  lessonId: string,
  videoId: string
): Promise<GrantOutcome> {
  const result = await authenticatedAction(async (api) =>
    grantOf(await api.lessons.resignRecordingUpload({ id: lessonId, videoId }))
  );
  if (!result.success)
    console.error("Error signing a recording upload again:", result.error);
  return withReason(result);
}
