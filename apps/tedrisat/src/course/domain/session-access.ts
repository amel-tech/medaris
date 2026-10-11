import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

/**
 * How a celse is attended (MDRS-283). A session has three ways in: its meeting
 * link (`lessons.meeting_url`), its live stream (`lessons.live_stream_url`,
 * MDRS-162) and the in-person mark, which the course sets for all of its
 * sessions (`courses.in_person`) and a session may override
 * (`lessons.in_person`, null to follow the course).
 *
 * Owner, 2026-10-11: a session is covered when it has any one of the three.
 * Only a session with none of them is "without access", which is what the
 * course menu's badge, the köşk nazımı's home page and the medrese's Pano
 * flag. Each of those screens decides for itself which sessions it looks at
 * (still ahead, in the next seven days); whether a session is covered is
 * decided here, once.
 */

/** A link that is null or only whitespace is no link (MDRS-183). */
export const hasLink = (url: string | null | undefined): boolean =>
  Boolean(url?.trim());

/** Whether the session is held in person: its own mark, else the course's. */
export const effectiveInPerson = (
  override: boolean | null,
  courseInPerson: boolean
): boolean => override ?? courseInPerson;

/**
 * The attendance fields a lesson carries out of the repository, read off its
 * stored row and its course. The stream link itself stays behind: only
 * whether there is one travels (`hasLiveStream`).
 */
export function sessionAttendance(
  row: { liveStreamUrl: string | null; inPersonOverride: boolean | null },
  courseInPerson: boolean
): {
  inPerson: boolean;
  inPersonOverride: boolean | null;
  hasLiveStream: boolean;
} {
  return {
    inPerson: effectiveInPerson(row.inPersonOverride, courseInPerson),
    inPersonOverride: row.inPersonOverride,
    hasLiveStream: hasLink(row.liveStreamUrl),
  };
}

/** The columns the rule reads: Drizzle columns, or raw aliases such as `sql\`l.meeting_url\``. */
export interface ISessionAccessColumns {
  meetingUrl: SQLWrapper;
  liveStreamUrl: SQLWrapper;
  /** `lessons.in_person`: the session's own mark, null to follow the course. */
  lessonInPerson: SQLWrapper;
  /** `courses.in_person`. */
  courseInPerson: SQLWrapper;
}

const blank = (column: SQLWrapper): SQL =>
  sql`(${column} is null or btrim(${column}) = '')`;

/** `coalesce(lessons.in_person, courses.in_person)`, as SQL. */
export const inPersonSql = (
  c: Pick<ISessionAccessColumns, "lessonInPerson" | "courseInPerson">
): SQL<boolean> =>
  sql<boolean>`coalesce(${c.lessonInPerson}, ${c.courseInPerson})`;

/** A meeting link that is not blank, as SQL. */
export const hasMeetingLinkSql = (
  c: Pick<ISessionAccessColumns, "meetingUrl">
): SQL<boolean> => sql<boolean>`(not ${blank(c.meetingUrl)})`;

/** A stream link that is not blank, as SQL. */
export const hasLiveStreamSql = (
  c: Pick<ISessionAccessColumns, "liveStreamUrl">
): SQL<boolean> => sql<boolean>`(not ${blank(c.liveStreamUrl)})`;

/**
 * The coverage rule as SQL: true for a session that has no meeting link, no
 * live stream and is not held in person. The caller adds which sessions the
 * screen looks at (live, standing, shown, still ahead).
 */
export const withoutAccessSql = (c: ISessionAccessColumns): SQL<boolean> =>
  sql<boolean>`(${blank(c.meetingUrl)} and ${blank(c.liveStreamUrl)} and not ${inPersonSql(c)})`;
