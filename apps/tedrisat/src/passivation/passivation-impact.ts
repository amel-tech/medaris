import { createHash, timingSafeEqual } from "node:crypto";
import type { PassivationImpactResponse } from "./dto/passivation.dto";

/** How many days ahead a live session counts as "in the next days" (MDRS-227, decision D3). */
export const PASSIVATION_SESSION_WINDOW_DAYS = 7;

/** What the screen lists of the courses and of the sessions; the token covers all of them. */
export const PASSIVATION_COURSE_ITEMS = 50;
export const PASSIVATION_SESSION_ITEMS = 5;

export const PASSIVATION_SCOPE_TYPES = ["KOSK", "MADRASAH"] as const;
export type PassivationScopeType = (typeof PASSIVATION_SCOPE_TYPES)[number];

export interface IImpactCourse {
  id: string;
  title: string;
  koskName: string;
  status: string;
  /** Someone holds the MUDERRIS role in it now: the course is open today and closes with the scope. */
  liveMuderris: boolean;
  enrolled: number;
  completed: number;
}

export interface IImpactSession {
  id: string;
  title: string;
  courseTitle: string;
  scheduledAt: Date;
}

/** What making a köşk or medrese passive takes along, measured at one moment. */
export interface IPassivationImpact {
  scope: { type: PassivationScopeType; id: string; name: string };
  alreadyPassive: boolean;
  /**
   * The scope had a manager once, held or not. The engine calls a scope passive
   * only then; one that never had a manager is new, and passivating it closes
   * nothing.
   */
  closesContent: boolean;
  /** Who holds the manager role now and is taken off the post. */
  staffIds: string[];
  /** Every course below that is not hidden, whatever its status. */
  courses: IImpactCourse[];
  /** Distinct talebe over those courses: a talebe in two courses counts once. */
  students: { enrolled: number; completed: number };
  sessions: { windowDays: number; items: IImpactSession[] };
}

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The token the caller posts back (MDRS-227): a SHA-256 of the facts the
 * screen showed, in one canonical order, bound to the scope and to the person
 * it was made for. Only ids and counts go in, never a name or a time, so the
 * same facts always give the same token and any change in them gives another.
 * It is a change detector, not a secret: whoever may preview may confirm, and
 * the server recomputes it under the row lock instead of trusting it.
 */
export function confirmationOf(
  impact: IPassivationImpact,
  actorId: string
): string {
  const canonical = {
    v: 1,
    type: impact.scope.type,
    id: impact.scope.id.toLowerCase(),
    actor: actorId.toLowerCase(),
    closesContent: impact.closesContent,
    staff: impact.staffIds.map((id) => id.toLowerCase()).sort(byId),
    courses: impact.courses
      .map(
        (c) =>
          [
            c.id.toLowerCase(),
            c.status,
            c.liveMuderris ? 1 : 0,
            c.enrolled,
            c.completed,
          ] as const
      )
      .sort((a, b) => byId(a[0], b[0])),
    students: [impact.students.enrolled, impact.students.completed],
    window: impact.sessions.windowDays,
    sessions: impact.sessions.items.map((s) => s.id.toLowerCase()).sort(byId),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/** Whether the posted token is the one the impact gives; a short or foreign string is a no, never a throw. */
export function confirmationMatches(
  impact: IPassivationImpact,
  actorId: string,
  posted: string
): boolean {
  const expected = Buffer.from(confirmationOf(impact, actorId));
  const given = Buffer.from(posted);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The impact as the API answers it: counts, the first courses and sessions, and the token for exactly these facts. */
export function presentImpact(
  impact: IPassivationImpact,
  actorId: string
): PassivationImpactResponse {
  const items = [...impact.courses].sort(
    (a, b) => b.enrolled - a.enrolled || a.title.localeCompare(b.title, "tr")
  );
  const sessions = [...impact.sessions.items].sort(
    (a, b) =>
      a.scheduledAt.getTime() - b.scheduledAt.getTime() || byId(a.id, b.id)
  );
  return {
    scope: impact.scope,
    alreadyPassive: impact.alreadyPassive,
    closesContent: impact.closesContent,
    staffLeaving: impact.staffIds.length,
    courses: {
      total: impact.courses.length,
      published: impact.courses.filter((c) => c.status === "PUBLISHED").length,
      draft: impact.courses.filter((c) => c.status === "DRAFT").length,
      withLiveMuderris: impact.courses.filter((c) => c.liveMuderris).length,
      items: items.slice(0, PASSIVATION_COURSE_ITEMS),
      truncated: items.length > PASSIVATION_COURSE_ITEMS,
    },
    students: impact.students,
    sessions: {
      windowDays: impact.sessions.windowDays,
      count: sessions.length,
      next: sessions.slice(0, PASSIVATION_SESSION_ITEMS),
    },
    confirmation: confirmationOf(impact, actorId),
  };
}

/** What the audit row keeps of the impact the person confirmed. */
export function auditImpactOf(impact: IPassivationImpact) {
  return {
    courses: impact.courses.length,
    withLiveMuderris: impact.courses.filter((c) => c.liveMuderris).length,
    enrolled: impact.students.enrolled,
    completed: impact.students.completed,
    closesContent: impact.closesContent,
    sessions: {
      windowDays: impact.sessions.windowDays,
      count: impact.sessions.items.length,
    },
    courseIds: impact.courses.map((c) => c.id).sort(byId),
  };
}
