"use server";

import type { MyQuestionNoteResponse } from "@medaris/services/tedrisat";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";

/**
 * A talebe's note on a question (MDRS-248, soru notları): written on a
 * question of their own attempt, kept to them, and sent to the course's hoca
 * when `sharedWithTeacher` is on. Nothing is revalidated: every screen that
 * shows a note keeps its own copy, and the notes page is read per request.
 */

type Result<T> = Promise<AuthenticatedActionResult<T>>;

export const saveMyQuestionNote = async (
  questionId: string,
  body: string,
  sharedWithTeacher: boolean
): Result<MyQuestionNoteResponse> =>
  authenticatedAction((api) =>
    api.questionNotes.saveMyQuestionNote({
      questionId,
      saveMyQuestionNoteDto: { body, sharedWithTeacher },
    })
  );

export const deleteMyQuestionNote = async (questionId: string): Result<void> =>
  authenticatedAction((api) =>
    api.questionNotes.deleteMyQuestionNote({ questionId })
  );
