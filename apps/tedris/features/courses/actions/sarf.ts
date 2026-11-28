"use server";

import type { CourseSarfRootResponse } from "@medaris/services/tedrisat";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";

/**
 * The roots the course's müderris put on its sarf page (`GET
 * /courses/:id/sarf-roots`). The tables are written from each root in the
 * browser, so this is the whole read. Nothing is revalidated: the tab keeps
 * its own list.
 */
export const listCourseSarfRoots = async (
  courseId: string
): Promise<AuthenticatedActionResult<CourseSarfRootResponse[]>> =>
  authenticatedAction((api) =>
    api.courses.listCourseSarfRoots({ id: courseId })
  );
