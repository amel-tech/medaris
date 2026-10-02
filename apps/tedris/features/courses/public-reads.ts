import {
  type CourseDetailResponse,
  createServerTedrisatAPIs,
  type KoskResponse,
  type MadrasahOverviewResponse,
  type MadrasahResponse,
  type SessionResponse,
} from "@medaris/services/tedrisat";
import { cache } from "react";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth_options";

/**
 * Reads for the köşk, medrese and course intro pages (MDRS-122), which a
 * signed-out visitor may open. Not a `"use server"` module on purpose: these
 * are called by server components only and are not server actions a browser
 * could post to.
 *
 * Two kinds:
 *
 * - `*ForMetadata` call tedrisat with **no token**, whoever is looking. Page
 *   titles and Open Graph tags are what a link preview or a crawler sees, so
 *   they describe only what a caller with no token may see: an unlisted köşk,
 *   a draft or a hidden course answers 404 there, and the page falls back to
 *   the generic title rather than leaking a name into a shared preview.
 * - The rest call with the visitor's token when there is one (the page itself
 *   — enrollment, follow state, an unlisted köşk opened by its link), and with
 *   none otherwise.
 */

const anonymousApi = () =>
  createServerTedrisatAPIs(undefined, env.TEDRISAT_API_BASE_URL);

const viewerApi = async () =>
  createServerTedrisatAPIs(await getAccessToken(), env.TEDRISAT_API_BASE_URL);

/** Null on any failure — a 404 included; the page decides what that means. */
const orNull = async <T>(read: () => Promise<T>): Promise<T | null> => {
  try {
    return await read();
  } catch {
    return null;
  }
};

export const getKoskForMetadata = (id: string): Promise<KoskResponse | null> =>
  orNull(async () => (await anonymousApi()).kosks.getKoskById({ id }));

export const getCourseForMetadata = (
  id: string
): Promise<CourseDetailResponse | null> =>
  orNull(async () => (await anonymousApi()).courses.getCourseById({ id }));

export const getMadrasahForMetadata = (
  id: string
): Promise<MadrasahResponse | null> =>
  orNull(async () => (await anonymousApi()).madrasahs.getMadrasahById({ id }));

/** Cached per request: the segment layout and the page both ask (see `[madrasahId]/layout.tsx`). */
export const getMadrasah = cache(
  (id: string): Promise<MadrasahResponse | null> =>
    orNull(async () => (await viewerApi()).madrasahs.getMadrasahById({ id }))
);

/**
 * What the medrese page shows (MDRS-157): its courses with the caller's own
 * enrollment, the köşks they are in, and the başmüderris. Null on any failure;
 * the page treats that like a missing medrese.
 */
export const getMadrasahOverview = (
  id: string
): Promise<MadrasahOverviewResponse | null> =>
  orNull(async () => (await viewerApi()).madrasahs.getMadrasahOverview({ id }));

/**
 * One live session with its status, cancellation, neighbours and — for a
 * caller who may read course content — its link (MDRS-158). Cached per
 * request: the segment layout settles a 404 before the skeleton streams, and
 * the page reads the same answer. Null on any failure, a 404 included.
 */
export const getSession = cache(
  (courseId: string, sessionId: string): Promise<SessionResponse | null> =>
    orNull(async () =>
      (await viewerApi()).lessons.getSession({ courseId, sessionId })
    )
);

/** Whether the visitor has a usable token — what tedrisat will see. */
export const isSignedIn = async (): Promise<boolean> =>
  Boolean(await getAccessToken());
