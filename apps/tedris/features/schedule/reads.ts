import type { ScheduleSessionResponse } from "@medaris/services/tedrisat";
import { memberApi } from "~/lib/tedrisat-api";

/**
 * Server-side reads of the caller's own schedule (MDRS-163). Not a
 * `"use server"` module: only server components call these. Without a session
 * they send the visitor to sign in (A16); the client is built outside the
 * `try` so that redirect is not taken for a failed read.
 */

/** Null when tedrisat cannot answer, so the page can say so instead of showing an empty week. */
export const getMySessions = async (
  from: string,
  to: string
): Promise<ScheduleSessionResponse[] | null> => {
  const { sessions } = await memberApi();
  try {
    return await sessions.listMySessions({ from, to });
  } catch (error) {
    console.error("Error fetching the caller's sessions:", error);
    return null;
  }
};

/** The next sessions that stand, or null when tedrisat cannot answer. */
export const getMyUpcomingLessons = async (
  limit = 4
): Promise<ScheduleSessionResponse[] | null> => {
  const { sessions } = await memberApi();
  try {
    return await sessions.listMyUpcomingLessons({ limit });
  } catch (error) {
    console.error("Error fetching the caller's upcoming sessions:", error);
    return null;
  }
};
