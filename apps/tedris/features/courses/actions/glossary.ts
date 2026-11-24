"use server";

import type { CourseTermResponse } from "@medaris/services/tedrisat";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";

/**
 * The course's glossary (`GET /courses/:id/terms`): every term at once, for
 * the tab to sort and search. Nothing is revalidated: the tab keeps its list.
 */
export const listCourseTerms = async (
  courseId: string
): Promise<AuthenticatedActionResult<CourseTermResponse[]>> =>
  authenticatedAction((api) => api.courses.listCourseTerms({ id: courseId }));
