"use server";

import { TeamSettableEnrollmentStatus } from "@medaris/services/tedrisat";
import {
  type ActionOutcome,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";

/**
 * Talebeler of a course. "Onayla" and "Reddet" are the Pano's actions
 * (`approveApplication`, `rejectApplication`); these two are the course team's
 * decisions on a seat. A refusal is its code (AUTHZ_FORBIDDEN,
 * ENROLLMENT_STATE_CONFLICT, ENROLLMENT_NOT_FOUND) and the page words it.
 */

/**
 * "Tamamladı say" and "Yeniden aç" (`PATCH /courses/:id/enrollments/:userId`):
 * the course team marks a talebe's course complete, or reopens it. The talebe's
 * own progress never does.
 */
export async function setCompleted(
  courseId: string,
  userId: string,
  completed: boolean
): Promise<ActionOutcome<null>> {
  const result = await authenticatedAction(async (api) => {
    await api.courses.setEnrollmentStatus({
      id: courseId,
      userId,
      setEnrollmentStatusDto: {
        status: completed
          ? TeamSettableEnrollmentStatus.Completed
          : TeamSettableEnrollmentStatus.Enrolled,
      },
    });
    return null;
  });
  if (!result.success)
    console.error("Error setting a talebe's completion:", result.error);
  return outcomeOf(result);
}

/**
 * "Dersten çıkar" (`POST /courses/:id/enrollments/:userId/remove`): the seat
 * goes and the reason, which the API requires and keeps in its audit log, is
 * shown to the course team. Not a ban: the talebe may apply again.
 */
export async function removeStudent(
  courseId: string,
  userId: string,
  reason: string
): Promise<ActionOutcome<null>> {
  const result = await authenticatedAction(async (api) => {
    await api.courses.removeEnrollment({
      id: courseId,
      userId,
      removeEnrollmentDto: { reason },
    });
    return null;
  });
  if (!result.success)
    console.error("Error removing a talebe from a course:", result.error);
  return outcomeOf(result);
}
