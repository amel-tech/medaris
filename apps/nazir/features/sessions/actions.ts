"use server";

import type {
  CreateSessionBatchDto,
  WeeklyPatternDto,
} from "@medaris/services/tedrisat";
import {
  type ActionOutcome,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";

/**
 * Celseler and "Celse planla": every write is one call of
 * tedrisat's session endpoints, none of which sends the whole course. `version`
 * is the course version the page was read at; a 409 (`COURSE_VERSION_CONFLICT`)
 * means somebody saved the course since, and nothing was written. A refusal
 * is its code and the page words it; the server's message never reaches the
 * browser.
 */

/** "Bağlantıyı güncelle" / "Tarihi değiştir" (`PATCH /lessons/:id`): one session, nothing else of the course. */
export async function changeSession(
  lessonId: string,
  change:
    | { version: number; meetingUrl: string }
    | { version: number; scheduledAt: string }
): Promise<ActionOutcome<{ courseVersion: number }>> {
  const result = await authenticatedAction(async (api) => {
    const { courseVersion } = await api.lessons.updateLesson({
      id: lessonId,
      updateLessonDto:
        "meetingUrl" in change
          ? { version: change.version, meetingUrl: change.meetingUrl }
          : {
              version: change.version,
              scheduledAt: new Date(change.scheduledAt),
            },
    });
    return { courseVersion };
  });
  if (!result.success) console.error("Error changing a session:", result.error);
  return outcomeOf(result);
}

/** "İptal et" (`POST /lessons/:id/cancel`): the session stays in the programme, marked cancelled. */
export async function cancelSession(
  lessonId: string,
  version: number
): Promise<ActionOutcome<{ courseVersion: number }>> {
  const result = await authenticatedAction(async (api) => {
    const { courseVersion } = await api.lessons.cancelLesson({
      id: lessonId,
      cancelLessonDto: { version },
    });
    return { courseVersion };
  });
  if (!result.success)
    console.error("Error cancelling a session:", result.error);
  return outcomeOf(result);
}

/**
 * "Canlı yayın" (`PUT /lessons/:id/live-stream`): sets the session's YouTube
 * stream link, or clears it with `null`. tedrisat normalises the link; the
 * course version is not involved. The code is `AUTHZ_FORBIDDEN` for whoever
 * does not hold `session.live_link`.
 */
export async function setLiveStream(
  lessonId: string,
  liveStreamUrl: string | null
): Promise<ActionOutcome<{ liveStreamUrl: string | null }>> {
  const result = await authenticatedAction(async (api) => {
    const saved = await api.lessons.setLessonLiveStream({
      id: lessonId,
      setLiveStreamDto: { liveStreamUrl },
    });
    return { liveStreamUrl: saved.liveStreamUrl };
  });
  if (!result.success)
    console.error("Error setting a live stream link:", result.error);
  return outcomeOf(result);
}

/**
 * The sessions a weekly pattern would create, expanded by tedrisat exactly as
 * `createSessions` will. Writes nothing.
 */
export async function previewSessions(
  courseId: string,
  pattern: WeeklyPatternDto
): Promise<
  ActionOutcome<{
    sessions: Array<{
      /** ISO time */
      scheduledAt: string;
      localDate: string;
      weekNumber: number;
    }>;
  }>
> {
  const result = await authenticatedAction(async (api) => {
    const { sessions } = await api.lessons.previewSessionBatch({
      courseId,
      weeklyPatternDto: pattern,
    });
    return {
      sessions: sessions.map((session) => ({
        scheduledAt: new Date(session.scheduledAt).toISOString(),
        localDate: session.localDate,
        weekNumber: session.weekNumber,
      })),
    };
  });
  if (!result.success)
    console.error("Error previewing sessions:", result.error);
  return outcomeOf(result);
}

/**
 * "N celse oluştur" (`POST /courses/:id/sessions/batch`): every session of a
 * pattern in one transaction, and the make-up of a cancelled session (a
 * pattern of one). It bumps the course version, so the table reads again.
 */
export async function createSessions(
  courseId: string,
  batch: CreateSessionBatchDto
): Promise<ActionOutcome<{ count: number }>> {
  const result = await authenticatedAction(async (api) => {
    const { lessons } = await api.lessons.createSessionBatch({
      courseId,
      createSessionBatchDto: batch,
    });
    return { count: lessons.length };
  });
  if (!result.success) console.error("Error creating sessions:", result.error);
  return outcomeOf(result);
}
