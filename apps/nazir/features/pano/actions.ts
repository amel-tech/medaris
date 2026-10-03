"use server";

import {
  type ActionOutcome,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";

/**
 * "Onayla" of the Pano (`POST /courses/:id/enrollments/:userId/approve`): the
 * talebe takes a seat. Only the course's müderris, the köşk's nazım and the
 * sistem yöneticisi may (the dashboard says which rows), so a başmüderris who is
 * none of them gets AUTHZ_FORBIDDEN.
 */
export async function approveApplication(
  courseId: string,
  userId: string
): Promise<ActionOutcome<null>> {
  const result = await authenticatedAction(async (api) => {
    await api.courses.approveEnrollment({ id: courseId, userId });
    return null;
  });
  if (!result.success)
    console.error("Error approving an application:", result.error);
  return outcomeOf(result);
}

/** "Reddet" of the Pano (`DELETE /courses/:id/enrollments/:userId`): only a pending application can be rejected, and no reason is taken. */
export async function rejectApplication(
  courseId: string,
  userId: string
): Promise<ActionOutcome<null>> {
  const result = await authenticatedAction(async (api) => {
    await api.courses.rejectEnrollment({ id: courseId, userId });
    return null;
  });
  if (!result.success)
    console.error("Error rejecting an application:", result.error);
  return outcomeOf(result);
}
