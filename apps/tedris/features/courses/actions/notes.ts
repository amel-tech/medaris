"use server";

import type { LessonNoteResponse } from "@medaris/services/tedrisat";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";

/**
 * The talebe's own notes on a session's video (MDRS-150). The API returns a
 * caller's notes to the caller alone, so these four are the whole surface: no
 * action reads anyone else's. Nothing is revalidated: the panel keeps its own
 * list and the notes appear on no server-rendered page.
 */

export const listLessonNotes = async (
  lessonId: string
): Promise<AuthenticatedActionResult<LessonNoteResponse[]>> =>
  authenticatedAction((api) => api.lessons.listLessonNotes({ id: lessonId }));

export const createLessonNote = async (
  lessonId: string,
  note: { body: string; offsetSeconds: number | null }
): Promise<AuthenticatedActionResult<LessonNoteResponse>> =>
  authenticatedAction((api) =>
    api.lessons.createLessonNote({ id: lessonId, createLessonNoteDto: note })
  );

export const updateLessonNote = async (
  lessonId: string,
  noteId: string,
  note: { body?: string; offsetSeconds?: number | null }
): Promise<AuthenticatedActionResult<LessonNoteResponse>> =>
  authenticatedAction((api) =>
    api.lessons.updateLessonNote({
      id: lessonId,
      noteId,
      updateLessonNoteDto: note,
    })
  );

export const deleteLessonNote = async (
  lessonId: string,
  noteId: string
): Promise<AuthenticatedActionResult<void>> =>
  authenticatedAction((api) =>
    api.lessons.deleteLessonNote({ id: lessonId, noteId })
  );
