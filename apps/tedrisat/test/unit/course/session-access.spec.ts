import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  effectiveInPerson,
  hasLink,
  sessionAttendance,
  withoutAccessSql,
} from "../../../src/course/domain/session-access";
import { courses, lessons } from "../../../src/database/schema/course.schema";

/**
 * MDRS-283: a session is covered when it has a meeting link, a live stream or
 * the in-person mark (the session's own, else the course's). The rule runs in
 * Postgres for the course badge, the köşk home page and the Pano; the
 * database end of it is in test/e2e/session-access.e2e.spec.ts.
 */
describe("session access (MDRS-283)", () => {
  it("reads a blank link as no link", () => {
    expect(hasLink(null)).toBe(false);
    expect(hasLink(undefined)).toBe(false);
    expect(hasLink("   ")).toBe(false);
    expect(hasLink("https://meet.google.com/abc-defg-hij")).toBe(true);
  });

  it("lets the session's own mark override the course's in both directions", () => {
    expect(effectiveInPerson(null, false)).toBe(false);
    expect(effectiveInPerson(null, true)).toBe(true);
    expect(effectiveInPerson(true, false)).toBe(true);
    expect(effectiveInPerson(false, true)).toBe(false);
  });

  it("hands out whether there is a stream, never the stream", () => {
    const attendance = sessionAttendance(
      {
        liveStreamUrl: "https://www.youtube.com/watch?v=abcdefghijk",
        inPersonOverride: null,
      },
      true
    );
    expect(attendance).toEqual({
      inPerson: true,
      inPersonOverride: null,
      hasLiveStream: true,
    });
    expect(JSON.stringify(attendance)).not.toContain("youtube");
    expect(
      sessionAttendance({ liveStreamUrl: " ", inPersonOverride: false }, true)
    ).toEqual({
      inPerson: false,
      inPersonOverride: false,
      hasLiveStream: false,
    });
  });

  it("is one SQL rule over the three ways in", () => {
    const dialect = new PgDialect();
    const drizzleColumns = dialect.sqlToQuery(
      withoutAccessSql({
        meetingUrl: lessons.meetingUrl,
        liveStreamUrl: lessons.liveStreamUrl,
        lessonInPerson: lessons.inPersonOverride,
        courseInPerson: courses.inPerson,
      })
    ).sql;
    expect(drizzleColumns).toBe(
      `(("lessons"."meeting_url" is null or btrim("lessons"."meeting_url") = '') and ("lessons"."live_stream_url" is null or btrim("lessons"."live_stream_url") = '') and not coalesce("lessons"."in_person", "courses"."in_person"))`
    );
    const rawAliases = dialect.sqlToQuery(
      withoutAccessSql({
        meetingUrl: sql`l.meeting_url`,
        liveStreamUrl: sql`l.live_stream_url`,
        lessonInPerson: sql`l.in_person`,
        courseInPerson: sql`c.in_person`,
      })
    ).sql;
    expect(rawAliases).toBe(
      `((l.meeting_url is null or btrim(l.meeting_url) = '') and (l.live_stream_url is null or btrim(l.live_stream_url) = '') and not coalesce(l.in_person, c.in_person))`
    );
  });
});
