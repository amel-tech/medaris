"use server";

import type { HocaUnvan, UpdateCourseDto } from "@medaris/services/tedrisat";
import {
  type ActionOutcome,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";

/**
 * Ders ayarları: each write is one call of tedrisat's course or session
 * endpoints. `PATCH /courses/:id` takes no version (the last save wins) and
 * hands back the version the course is now at; `PATCH /lessons/:id` carries
 * the version the page was read at, and a 409 (`COURSE_VERSION_CONFLICT`)
 * means somebody saved the course since and nothing was written. A refusal is
 * its code and the page words it; the server's message never reaches the
 * browser. The page reads itself again with `router.refresh()`.
 */

/** "Kaydet" (`PATCH /courses/:id`): only the fields in `patch` change. */
export async function saveCourseSettings(
  courseId: string,
  patch: UpdateCourseDto
): Promise<ActionOutcome<{ version: number }>> {
  const result = await authenticatedAction(async (api) => {
    const { version } = await api.courses.updateCourse({
      id: courseId,
      updateCourseDto: patch,
    });
    return { version };
  });
  if (!result.success)
    console.error("Error saving the course settings:", result.error);
  return outcomeOf(result);
}

/** "Yayımla" / "Taslağa çek" (`PATCH /courses/:id`): the status alone. */
export async function setCourseStatus(
  courseId: string,
  status: "DRAFT" | "PUBLISHED"
): Promise<ActionOutcome<{ version: number }>> {
  const result = await authenticatedAction(async (api) => {
    const { version } = await api.courses.updateCourse({
      id: courseId,
      updateCourseDto: { status },
    });
    return { version };
  });
  if (!result.success)
    console.error("Error changing the course's status:", result.error);
  return outcomeOf(result);
}

/** "Örnek ders" (`PATCH /lessons/:id`): one session marked as the sample, or no longer. */
export async function setSampleLesson(
  lessonId: string,
  change: { version: number; isPreview: boolean }
): Promise<ActionOutcome<{ courseVersion: number }>> {
  const result = await authenticatedAction(async (api) => {
    const { courseVersion } = await api.lessons.updateLesson({
      id: lessonId,
      updateLessonDto: { version: change.version, isPreview: change.isPreview },
    });
    return { courseVersion };
  });
  if (!result.success)
    console.error("Error changing the sample session:", result.error);
  return outcomeOf(result);
}

/**
 * "Kaydet" of Hocalar ve unvanları (`PUT /courses/:id/muderris/:userId/unvan`):
 * the unvan one hoca carries in this course, or null for none. It moves no
 * version, so it is not held to the one the page was read at.
 */
export async function setHocaUnvan(
  courseId: string,
  userId: string,
  unvan: HocaUnvan | null
): Promise<ActionOutcome<{ unvan: HocaUnvan | null }>> {
  const result = await authenticatedAction(async (api) => {
    const row = await api.courses.setCourseMuderrisUnvan({
      id: courseId,
      userId,
      setMuderrisUnvanDto: { unvan },
    });
    return { unvan: row.unvan ?? null };
  });
  if (!result.success)
    console.error("Error setting a hoca's unvan:", result.error);
  return outcomeOf(result);
}

/**
 * "Ekle" of Ortak uygulama kodları (`POST /courses/:id/partner-codes`): maps a
 * partner application's code to this course. A code another course has is
 * refused (`PARTNER_CODE_TAKEN`), and the page says so naming nothing else.
 */
export async function addPartnerCode(
  courseId: string,
  partner: string,
  code: string
): Promise<ActionOutcome<{ code: string }>> {
  const result = await authenticatedAction(async (api) => {
    const added = await api.courses.addCoursePartnerCode({
      id: courseId,
      addPartnerCodeDto: { partner, code },
    });
    return { code: added.code };
  });
  if (!result.success)
    console.error("Error adding a partner code:", result.error);
  return outcomeOf(result);
}

/** "Kaldır" of Ortak uygulama kodları (`DELETE /courses/:id/partner-codes/:partner/:code`). */
export async function removePartnerCode(
  courseId: string,
  partner: string,
  code: string
): Promise<ActionOutcome<null>> {
  const result = await authenticatedAction(async (api) => {
    await api.courses.removeCoursePartnerCode({ id: courseId, partner, code });
    return null;
  });
  if (!result.success)
    console.error("Error removing a partner code:", result.error);
  return outcomeOf(result);
}
