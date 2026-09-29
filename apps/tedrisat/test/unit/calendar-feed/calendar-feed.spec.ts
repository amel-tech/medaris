import { ThrottlerException } from "@nestjs/throttler";
import {
  calendarFeedUrls,
  hashCalendarFeedToken,
  newCalendarFeedToken,
  tokenFromFeedFile,
} from "../../../src/calendar-feed/calendar-feed-token";
import { FeedPollLimiter } from "../../../src/calendar-feed/feed-poll-limiter";
import {
  buildCalendarFeedIcs,
  buildLessonIcs,
  type CalendarEventInput,
  sessionPageUrl,
  toCalendarLocale,
} from "../../../src/course/calendar/lesson-calendar";

/**
 * MDRS-120: the feed document and its token. What needs the app —
 * authorization, the window, regeneration — is in
 * test/e2e/calendar-feed.e2e.spec.ts.
 */

const COURSE_ID = "0e7b9a44-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const LESSON_A = "5b0f6c1e-7a3d-4f2b-9c51-2d8e4a6b1f00";
const LESSON_B = "5b0f6c1e-7a3d-4f2b-9c51-2d8e4a6b1f01";

const event = (
  lessonId: string,
  overrides: Partial<CalendarEventInput> = {}
): CalendarEventInput => ({
  course: { id: COURSE_ID, title: "Bina ve İzhar Şerhi", version: 3 },
  lesson: {
    id: lessonId,
    title: "Açılış",
    scheduledAt: new Date("2026-10-01T18:00:00.000Z"),
    durationMinutes: 60,
  },
  sessionPageUrl: sessionPageUrl("https://tedris.example", COURSE_ID, lessonId),
  locale: "tr",
  now: new Date("2026-09-28T09:15:30.000Z"),
  ...overrides,
});

const lines = (ics: string) => ics.replace(/\r\n /g, "").split("\r\n");

describe("calendar feed document (MDRS-120)", () => {
  it("names the calendar Medaris and asks to be re-read hourly", () => {
    const ics = buildCalendarFeedIcs([]);
    const l = lines(ics);
    expect(l[0]).toBe("BEGIN:VCALENDAR");
    expect(l).toContain("X-WR-CALNAME:Medaris");
    expect(l).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H");
    expect(l).toContain("X-PUBLISHED-TTL:PT1H");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("writes each event exactly as the one-session file does", () => {
    const single = lines(buildLessonIcs(event(LESSON_A)));
    const vevent = single.slice(
      single.indexOf("BEGIN:VEVENT"),
      single.indexOf("END:VEVENT") + 1
    );
    const feed = lines(buildCalendarFeedIcs([event(LESSON_A)]));
    const start = feed.indexOf("BEGIN:VEVENT");
    expect(feed.slice(start, feed.indexOf("END:VEVENT") + 1)).toEqual(vevent);
  });

  it("holds one VEVENT per session, each with its own UID", () => {
    const l = lines(buildCalendarFeedIcs([event(LESSON_A), event(LESSON_B)]));
    expect(l.filter((x) => x === "BEGIN:VEVENT")).toHaveLength(2);
    expect(l).toContain(`UID:lesson-${LESSON_A}@medaris.app`);
    expect(l).toContain(`UID:lesson-${LESSON_B}@medaris.app`);
  });

  it("marks a cancelled session STATUS:CANCELLED and a live one not at all", () => {
    const l = lines(
      buildCalendarFeedIcs([
        event(LESSON_A),
        event(LESSON_B, { cancelled: true }),
      ])
    );
    expect(l.filter((x) => x.startsWith("STATUS:"))).toEqual([
      "STATUS:CANCELLED",
    ]);
    const b = l.indexOf(`UID:lesson-${LESSON_B}@medaris.app`);
    expect(l.slice(b, l.indexOf("END:VEVENT", b))).toContain(
      "STATUS:CANCELLED"
    );
  });
});

describe("toCalendarLocale", () => {
  it("keeps the three languages the description is written in", () => {
    expect(toCalendarLocale("en")).toBe("en");
    expect(toCalendarLocale("ar-SA")).toBe("ar");
    expect(toCalendarLocale("EN_gb")).toBe("en");
  });

  it("falls back to Turkish for anything else, or nothing", () => {
    expect(toCalendarLocale("tr")).toBe("tr");
    expect(toCalendarLocale("de")).toBe("tr");
    expect(toCalendarLocale(null)).toBe("tr");
    expect(toCalendarLocale(undefined)).toBe("tr");
  });
});

describe("calendar feed token", () => {
  it("is 43 URL-safe characters and different every time", () => {
    const a = newCalendarFeedToken();
    const b = newCalendarFeedToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it("is stored as a SHA-256 that does not contain it", () => {
    const token = newCalendarFeedToken();
    const hash = hashCalendarFeedToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashCalendarFeedToken(token));
    expect(hash).not.toContain(token);
  });

  it("is read back only from `<token>.ics`", () => {
    const token = newCalendarFeedToken();
    expect(tokenFromFeedFile(`${token}.ics`)).toBe(token);
    expect(tokenFromFeedFile(token)).toBeNull();
    expect(tokenFromFeedFile(`${token}.ics.ics`)).toBeNull();
    expect(tokenFromFeedFile(`${token.slice(1)}.ics`)).toBeNull();
    expect(tokenFromFeedFile(`${token.slice(1)}/.ics`)).toBeNull();
  });

  it("gives the same feed as https for Google and webcal for Apple", () => {
    expect(calendarFeedUrls("https://tedris.example", "abc")).toEqual({
      url: "https://tedris.example/calendar/abc.ics",
      webcalUrl: "webcal://tedris.example/calendar/abc.ics",
    });
    expect(calendarFeedUrls("http://localhost:4000", "abc").webcalUrl).toBe(
      "webcal://localhost:4000/calendar/abc.ics"
    );
  });
});

describe("FeedPollLimiter", () => {
  it("allows the limit inside a window, refuses the next read, and resets after it", () => {
    const limiter = new FeedPollLimiter(2, 1_000);
    limiter.hit("a", 0);
    limiter.hit("a", 10);
    expect(() => limiter.hit("a", 20)).toThrow(ThrottlerException);
    limiter.hit("b", 20);
    limiter.hit("a", 1_000);
  });
});
