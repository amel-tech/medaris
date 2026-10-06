"use server";

import {
  type ActionOutcome,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";

/**
 * Ders nazırları of a course (MDRS-270): each write is one call of tedrisat's
 * course nazır routes, decided there by `course_nazir.assign` on the course,
 * and giving a permission by `permission.grant` through a role as well. The
 * page reads the list again after a write, so a write hands back nothing. A
 * refusal is its code and the page words it; the server's message never
 * reaches the browser. The person search is the medrese nazırs' own
 * (`lookupPerson` in `~/features/nazirs/actions`).
 */

/**
 * "No end" for `PATCH /courses/:id/nazirs/:postId`. The field is required and
 * nullable, and the generated serializer calls `toISOString()` on it with no
 * null check, so a plain `null` throws before the request leaves; this stands
 * in for it and goes out as `"endsAt": null`.
 */
const NO_END = { toISOString: () => null } as unknown as Date;

/**
 * "Ders nazırı ata" (`POST /courses/:id/nazirs`): the post and its
 * permissions, which end together. No `endsAt` is no end; `[]` appoints with
 * no permission, the only appointment a holder of `course_nazir.assign` by a
 * grant may make.
 */
export async function appointCourseNazir(
  courseId: string,
  body: {
    userId: string;
    permissions: string[];
    /** ISO time */
    endsAt?: string;
  }
): Promise<ActionOutcome<null>> {
  const result = await authenticatedAction(async (api) => {
    await api.courses.createCourseNazir({
      id: courseId,
      createCourseNazirDto: {
        userId: body.userId,
        permissions: body.permissions,
        ...(body.endsAt ? { endsAt: new Date(body.endsAt) } : {}),
      },
    });
    return null;
  });
  if (!result.success)
    console.error("Error appointing a ders nazırı:", result.error);
  return outcomeOf(result);
}

/**
 * "İzinleri düzenle" (`PATCH /courses/:id/nazirs/:postId`): the whole set the
 * post holds from now on, and its end, which the API asks for every time
 * (`null` is no end), so a change that leaves the end out cannot lift it.
 */
export async function changeCourseNazir(
  courseId: string,
  postId: string,
  body: {
    permissions: string[];
    /** ISO time; null is no end */
    endsAt: string | null;
  }
): Promise<ActionOutcome<null>> {
  const result = await authenticatedAction(async (api) => {
    await api.courses.updateCourseNazir({
      id: courseId,
      postId,
      updateCourseNazirDto: {
        permissions: body.permissions,
        endsAt: body.endsAt ? new Date(body.endsAt) : NO_END,
      },
    });
    return null;
  });
  if (!result.success)
    console.error("Error changing a ders nazırı's permissions:", result.error);
  return outcomeOf(result);
}

/**
 * "Görevden al" (`DELETE /courses/:id/nazirs/:postId`): the post and every
 * permission its holder has in the course end at once. The API refuses while
 * the people they appointed still hold their posts (DISMISS_SEAT_HANDED_ON).
 */
export async function endCourseNazir(
  courseId: string,
  postId: string
): Promise<ActionOutcome<null>> {
  const result = await authenticatedAction(async (api) => {
    await api.courses.revokeCourseNazir({ id: courseId, postId });
    return null;
  });
  if (!result.success)
    console.error("Error dismissing a ders nazırı:", result.error);
  return outcomeOf(result);
}
