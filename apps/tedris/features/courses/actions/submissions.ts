"use server";

import type {
  LessonSubmissionResponse,
  OwnSubmissionResponse,
} from "@medaris/services/tedrisat";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";

/**
 * The talebe's own homework on a celse (MDRS-290): read it, write its note,
 * remove one of its files. The API answers a caller about their own homework
 * alone, so these three are the whole surface; a file is added and
 * downloaded through this app's routes under `/api/files/…`, which stream it
 * (`@medaris/services/file-proxy`). Nothing is revalidated: the card keeps
 * its own state and the homework appears on no server-rendered page.
 */

export const getMySubmission = async (
  lessonId: string
): Promise<AuthenticatedActionResult<OwnSubmissionResponse>> =>
  authenticatedAction((api) =>
    api.submissions.getMySubmission({ id: lessonId })
  );

/** A blank note clears it; the API trims it and keeps at most 4000 characters. */
export const saveMySubmissionNote = async (
  lessonId: string,
  note: string | null
): Promise<AuthenticatedActionResult<LessonSubmissionResponse>> =>
  authenticatedAction((api) =>
    api.submissions.saveMySubmissionNote({
      id: lessonId,
      saveSubmissionNoteDto: { note },
    })
  );

/** The file goes from storage too; the API writes the removal to the audit log. */
export const deleteMySubmissionFile = async (
  lessonId: string,
  fileId: string
): Promise<AuthenticatedActionResult<void>> =>
  authenticatedAction((api) =>
    api.submissions.deleteMySubmissionFile({ id: lessonId, fileId })
  );
