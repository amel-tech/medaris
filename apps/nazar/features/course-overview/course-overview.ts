import type { CourseDetailResponse } from "@medaris/services/tedrisat";
import { sessionTime } from "../pano/pano";
import { sessionFacts } from "../sessions/sessions";

/**
 * Genel bakış of a course as rules: which of the course's waiting work is
 * shown, each as a box that links to the section where it is done. Pure on
 * purpose, so the page has nothing to decide.
 */

export type OverviewBoxId =
  | "applications"
  | "homework"
  | "withoutAccess"
  | "nextSession";

export interface OverviewBox {
  id: OverviewBoxId;
  /** a count, or the next session's time already worded */
  value: number | string;
  href: string;
}

/** What the page could read; null is a number that could not be read, or no session ahead. */
export interface OverviewFacts {
  /** `pendingApplications` of the course's badge counts */
  applications: number | null;
  /** homework not reviewed yet, for a holder of `submission.read` */
  homework: number | null;
  /** `sessionsWithoutAccess` of the course's badge counts (MDRS-283) */
  withoutAccess: number | null;
  /** when the next session starts */
  nextSession: Date | null;
}

const sectionHref = (courseId: string, segment: string): string =>
  `/ders/${encodeURIComponent(courseId)}/${segment}`;

/**
 * The next live session of the course that is still ahead and not
 * cancelled, by the course read, or null when there is none.
 */
export function nextSessionAt(
  course: Pick<CourseDetailResponse, "weeks">,
  now: Date
): Date | null {
  const next = sessionFacts(course).find(
    (fact) => !fact.cancelledAt && Date.parse(fact.startsAt) > now.getTime()
  );
  return next ? new Date(next.startsAt) : null;
}

/**
 * The boxes, in a fixed order: the applications (Talebeler, whose first tab
 * is Başvurular), the homework (Ödevler), the sessions nobody can join yet
 * and the next session (both Celseler). A count of zero or one that could
 * not be read draws no box, nor does a course with no session ahead; with
 * none left the page says there is nothing waiting. The next session is on
 * the course's clock.
 */
export function overviewBoxes(
  courseId: string,
  facts: OverviewFacts,
  where: { locale: string; timeZone: string }
): OverviewBox[] {
  const boxes: OverviewBox[] = [];
  const count = (id: OverviewBoxId, value: number | null, segment: string) => {
    if (value !== null && value > 0) {
      boxes.push({ id, value, href: sectionHref(courseId, segment) });
    }
  };
  count("applications", facts.applications, "talebeler");
  count("homework", facts.homework, "odevler");
  count("withoutAccess", facts.withoutAccess, "celseler");
  if (facts.nextSession) {
    boxes.push({
      id: "nextSession",
      value: sessionTime(facts.nextSession, where),
      href: sectionHref(courseId, "celseler"),
    });
  }
  return boxes;
}
