import {
  createServerTedrisatAPIs,
  type EnrolledCourseResponse,
  type FlashcardDeckSummaryResponse,
  type FollowedKoskCourseResponse,
} from "@medaris/services/tedrisat";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth_options";

/**
 * Server-side reads of Ana sayfa's three sections (MDRS-165). Not a
 * `"use server"` module: only server components call these. Each answers
 * `null` when tedrisat cannot, so one section can say so (and offer a retry)
 * while the others still show: an empty list would read as "you have nothing".
 */

const api = async () =>
  createServerTedrisatAPIs(await getAccessToken(), env.TEDRISAT_API_BASE_URL);

const orNull = async <T>(what: string, read: () => Promise<T>) => {
  try {
    return await read();
  } catch (error) {
    console.error(`Error fetching ${what}:`, error);
    return null;
  }
};

/** The courses the caller is in (a request still waiting for approval is not one), for "Kaldığın yerden devam et". */
export const getHomeCourses = (): Promise<EnrolledCourseResponse[] | null> =>
  orNull("the caller's courses", async () =>
    (await api()).courses.getEnrolledCourses()
  );

/** The decks with something to study today, for "Bugün çalışılacak desteler". */
export const getHomeDecks = (
  limit = 3
): Promise<FlashcardDeckSummaryResponse[] | null> =>
  orNull("the decks to study today", async () =>
    (await api()).decks.getFlashcardDecksDueToday({ limit })
  );

/** The courses of the köşks the caller follows, for "Takip ettiğin köşklerden". */
export const getHomeFollowedCourses = (
  limit = 4
): Promise<FollowedKoskCourseResponse[] | null> =>
  orNull("the followed köşks' courses", async () =>
    (await api()).kosks.getFollowedKoskCourses({ limit })
  );
