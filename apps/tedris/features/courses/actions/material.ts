"use server";

import type { LessonBoardResponse } from "@medaris/services/tedrisat";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";

/**
 * What the müderris prepared for a session, read by whoever reads the
 * course's content. Nothing is revalidated: each panel keeps what it read.
 */

/** The session's board (`GET /lessons/:id/board`); `scene: null` when it has none. */
export const getLessonBoard = async (
  lessonId: string
): Promise<AuthenticatedActionResult<LessonBoardResponse>> =>
  authenticatedAction((api) => api.lessons.getLessonBoard({ id: lessonId }));
