/**
 * Where a signed-in visitor goes when nothing asked for a particular page
 * (MDRS-101): the first-login screen B1 once, `/learning` from then on.
 *
 * Pure on purpose — `app/[locale]/start/page.tsx` reads the inputs (a cookie
 * and the enrollment count) and this decides, so the decision is testable
 * without a browser or an API.
 */

import { destinationFromCallback } from "@medaris/utils";
import { postSignInPage } from "./auth_pages";

/**
 * Set when a user leaves B1 through its button. It holds the Keycloak subjects
 * (`sub`) of the users who have, so a second account signing in on the same
 * browser still sees B1 once, and it survives sign-out. A browser cookie
 * rather than a server record: the API has no "has seen onboarding" field, and
 * the enrollment count below covers a returning user on a new device.
 */
export const WELCOMED_COOKIE = "tedris.welcomed";

export const WELCOMED_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** How many users one browser remembers; the oldest is dropped first. */
export const WELCOMED_COOKIE_MAX_USERS = 5;

const SEPARATOR = ".";

const welcomedSubjects = (cookieValue: string | undefined): string[] =>
  (cookieValue ?? "").split(SEPARATOR).filter(Boolean);

/** Whether `sub` has left B1 on this browser. No subject, no memory. */
export const hasWelcomed = (
  cookieValue: string | undefined,
  sub: string | undefined
): boolean => !!sub && welcomedSubjects(cookieValue).includes(sub);

/** The cookie value after `sub` leaves B1. */
export const withWelcomed = (
  cookieValue: string | undefined,
  sub: string
): string =>
  [...welcomedSubjects(cookieValue).filter((s) => s !== sub), sub]
    .slice(-WELCOMED_COOKIE_MAX_USERS)
    .join(SEPARATOR);

export interface PostSignInInputs {
  locale: string;
  /** `WELCOMED_COOKIE` names this user (`hasWelcomed`). */
  welcomed: boolean;
  /** Courses the user is enrolled in; 0 when the API could not be reached. */
  enrolledCourses: number;
}

export const welcomePath = (locale: string) => `/${locale}/welcome`;
export const learningPath = (locale: string) => `/${locale}/learning`;

export const resolvePostSignInPath = ({
  locale,
  welcomed,
  enrolledCourses,
}: PostSignInInputs): string =>
  welcomed || enrolledCourses > 0 ? learningPath(locale) : welcomePath(locale);

/** The `callbackUrl` the sign-in page passes on to Keycloak. */
export const signInCallbackUrl = (
  callbackUrl: string | null | undefined,
  options: { baseUrl: string; locales: readonly string[]; locale: string }
): string =>
  destinationFromCallback(callbackUrl, options) ??
  `/${options.locale}${postSignInPage}`;
