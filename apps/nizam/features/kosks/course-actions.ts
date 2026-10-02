"use server";

import type { CourseDetailResponse } from "@medaris/services/tedrisat";
import { revalidatePath } from "next/cache";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";

/** "Gizle" (nizam 23): the course leaves every list and waits in the Arşiv. */
export const hideCourse = async (
  courseId: string
): Promise<AuthenticatedActionResult<CourseDetailResponse>> => {
  const result = await authenticatedAction((api) =>
    api.courses.archiveCourse({ id: courseId })
  );
  if (result.success) revalidatePath("/", "layout");
  return result;
};

/** "Geri al" (nizam 23): the hidden course is back where it was. */
export const restoreCourse = async (
  courseId: string
): Promise<AuthenticatedActionResult<CourseDetailResponse>> => {
  const result = await authenticatedAction((api) =>
    api.courses.restoreCourse({ id: courseId })
  );
  if (result.success) revalidatePath("/", "layout");
  return result;
};
