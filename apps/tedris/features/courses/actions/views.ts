"use server";

import type { LessonViewResponse } from "@medaris/services/tedrisat";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";
import type { ViewReport } from "../watch-progress-model";

/**
 * Where the watch page's player is (MDRS-248, the "sayaç"). The API keeps the
 * caller's own record and nobody else's, and works the course progress out
 * from it. Nothing is revalidated: the watch page keeps its own state, and the
 * course page reads the records again when it is next rendered.
 */
export const recordLessonView = async (
  lessonId: string,
  report: ViewReport
): Promise<AuthenticatedActionResult<LessonViewResponse>> =>
  authenticatedAction((api) =>
    api.lessons.recordLessonView({ id: lessonId, recordLessonViewDto: report })
  );
