"use server";

import {
  type BulkEnrollmentResponse,
  TeamSettableEnrollmentStatus,
} from "@medaris/services/tedrisat";
import {
  type ActionOutcome,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";

/**
 * Talebeler of a course. "Onayla" and "Reddet" are the Pano's actions
 * (`approveApplication`, `rejectApplication`); the first two here are the
 * course team's decisions on a seat, the third its "Toplu talebe ekle". A
 * refusal is its code (AUTHZ_FORBIDDEN,
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
 * shown to the course team. The removal itself bars re-entry: tedrisat answers
 * a REVOKED seat's `enroll` with 409, and only the team's approval brings it
 * back.
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

/**
 * "Toplu talebe ekle" (`POST /courses/:id/enrollments/bulk`): the course team
 * enrols the people a list of e-mail addresses names, approving a waiting
 * request on the way. The answer says, address by address, what came of it;
 * a refusal is the API's code (AUTHZ_FORBIDDEN, COURSE_NOT_FOUND for a course
 * that takes no enrolments, KEYCLOAK_ADMIN_* when the realm cannot be asked).
 */
export async function bulkEnroll(
  courseId: string,
  emails: string[]
): Promise<ActionOutcome<BulkEnrollmentResponse>> {
  const result = await authenticatedAction((api) =>
    api.courses.bulkEnroll({ id: courseId, bulkEnrollDto: { emails } })
  );
  if (!result.success)
    console.error("Error enrolling a list of talebe:", result.error);
  return outcomeOf(result);
}
