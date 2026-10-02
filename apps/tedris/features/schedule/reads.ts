import {
  createServerTedrisatAPIs,
  type ScheduleSessionResponse,
} from "@medaris/services/tedrisat";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth_options";

/**
 * Server-side reads of the caller's own schedule (MDRS-163). Not a
 * `"use server"` module: only server components call these.
 */

/** Null when tedrisat cannot answer, so the page can say so instead of showing an empty week. */
export const getMySessions = async (
  from: string,
  to: string
): Promise<ScheduleSessionResponse[] | null> => {
  try {
    const { sessions } = await createServerTedrisatAPIs(
      await getAccessToken(),
      env.TEDRISAT_API_BASE_URL
    );
    return await sessions.listMySessions({ from, to });
  } catch (error) {
    console.error("Error fetching the caller's sessions:", error);
    return null;
  }
};

/** The next sessions that stand, or null when tedrisat cannot answer or there is no token. */
export const getMyUpcomingLessons = async (
  limit = 4
): Promise<ScheduleSessionResponse[] | null> => {
  try {
    const token = await getAccessToken();
    if (!token) return null;
    const { sessions } = await createServerTedrisatAPIs(
      token,
      env.TEDRISAT_API_BASE_URL
    );
    return await sessions.listMyUpcomingLessons({ limit });
  } catch (error) {
    console.error("Error fetching the caller's upcoming sessions:", error);
    return null;
  }
};
