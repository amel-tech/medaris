import {
  type CourseStatsResponse,
  createServerTedrisatAPIs,
  type KoskCourseRosterResponse,
  type KoskOverviewResponse,
  ResponseError,
} from "@medaris/services/tedrisat";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth_options";

/**
 * Server-side first reads of the köşk page, its Dersler table and a course's
 * overview (MDRS-175, nizam 20, 23 and 53). Not a `"use server"` module: only
 * the pages call them. A failed read is `null` so the page can say so in place;
 * a 403 and a 404 are told apart so the page shows "Bu bölüm için izniniz
 * yok" (nizam/06) instead.
 */
export type OverviewRead<T> = T | "forbidden" | "not-found" | null;

const api = async () =>
  createServerTedrisatAPIs(await getAccessToken(), env.TEDRISAT_API_BASE_URL);

async function read<T>(
  what: string,
  call: (apis: Awaited<ReturnType<typeof api>>) => Promise<T>
): Promise<OverviewRead<T>> {
  try {
    return await call(await api());
  } catch (error) {
    if (error instanceof ResponseError) {
      if (error.response.status === 403) return "forbidden";
      if (error.response.status === 404) return "not-found";
    }
    console.error(`Error fetching ${what}:`, error);
    return null;
  }
}

export const getKoskOverview = (
  koskId: string
): Promise<OverviewRead<KoskOverviewResponse>> =>
  read("the köşk overview", (apis) =>
    apis.kosks.getKoskOverview({ id: koskId })
  );

export const getKoskCourseRoster = (
  koskId: string
): Promise<OverviewRead<KoskCourseRosterResponse>> =>
  read("the köşk's course roster", (apis) =>
    apis.kosks.getKoskCourseRoster({ id: koskId })
  );

export const getCourseStats = (
  courseId: string
): Promise<OverviewRead<CourseStatsResponse>> =>
  read("the course stats", (apis) =>
    apis.courses.getCourseStats({ id: courseId })
  );
