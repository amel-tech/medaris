import type {
  EnrolledCourseResponse,
  FlashcardDeckSummaryResponse,
  FollowedKoskCourseResponse,
} from "@medaris/services/tedrisat";
import { memberApi, type TedrisatClient } from "~/lib/tedrisat-api";

/**
 * Server-side reads of Ana sayfa's three sections (MDRS-165). Not a
 * `"use server"` module: only server components call these. Each answers
 * `null` when tedrisat cannot, so one section can say so (and offer a retry)
 * while the others still show: an empty list would read as "you have nothing".
 * No session is not one of those: it is a trip to sign in (A16).
 */
const orNull = async <T>(
  what: string,
  read: (api: TedrisatClient) => Promise<T>
) => {
  // Outside the `try`: the sign-in redirect is thrown, not a failed read.
  const api = await memberApi();
  try {
    return await read(api);
  } catch (error) {
    console.error(`Error fetching ${what}:`, error);
    return null;
  }
};

/** The courses the caller is in (a request still waiting for approval is not one), for "Kaldığın yerden devam et". */
export const getHomeCourses = (): Promise<EnrolledCourseResponse[] | null> =>
  orNull("the caller's courses", (api) => api.courses.getEnrolledCourses());

/** The decks with something to study today, for "Bugün çalışılacak desteler". */
export const getHomeDecks = (
  limit = 3
): Promise<FlashcardDeckSummaryResponse[] | null> =>
  orNull("the decks to study today", (api) =>
    api.decks.getFlashcardDecksDueToday({ limit })
  );

/** The courses of the köşks the caller follows, for "Takip ettiğin köşklerden". */
export const getHomeFollowedCourses = (
  limit = 4
): Promise<FollowedKoskCourseResponse[] | null> =>
  orNull("the followed köşks' courses", (api) =>
    api.kosks.getFollowedKoskCourses({ limit })
  );
