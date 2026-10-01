import {
  buildLessonIcs,
  type CalendarLessonInput,
  escapeIcsText,
  foldIcsLine,
  formatIcsUtc,
  lessonEnd,
  sessionPageUrl,
} from "../../../src/course/calendar/lesson-calendar";

const LESSON_ID = "5b0f6c1e-7a3d-4f2b-9c51-2d8e4a6b1f00";
const COURSE_ID = "0e7b9a44-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const PAGE = sessionPageUrl("https://tedris.example", COURSE_ID, LESSON_ID);

const input = (
  overrides: Partial<CalendarLessonInput["lesson"]> = {}
): CalendarLessonInput => ({
  course: { id: COURSE_ID, title: "Bina ve İzhar Şerhi", version: 7 },
  lesson: {
    id: LESSON_ID,
    title: "Açılış",
    // 21:00 in Istanbul (UTC+3, no DST) is 18:00 UTC.
    scheduledAt: new Date("2026-10-01T18:00:00.000Z"),
    durationMinutes: 90,
    ...overrides,
  },
  sessionPageUrl: PAGE,
  locale: "tr",
  now: new Date("2026-09-28T09:15:30.456Z"),
});

/** Undo RFC 5545 folding, then split into content lines. */
const unfold = (ics: string) => ics.replace(/\r\n /g, "").split("\r\n");
const prop = (ics: string, name: string) =>
  unfold(ics)
    .find((l) => l.startsWith(`${name}:`))
    ?.slice(name.length + 1);

describe("lesson calendar (MDRS-117)", () => {
  it("writes one VEVENT with the fields the issue lists", () => {
    const ics = buildLessonIcs(input());
    const lines = unfold(ics);
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(1);
    expect(prop(ics, "UID")).toBe(`lesson-${LESSON_ID}@medaris.app`);
    expect(prop(ics, "DTSTAMP")).toBe("20260928T091530Z");
    expect(prop(ics, "SEQUENCE")).toBe("7");
    expect(prop(ics, "DTSTART")).toBe("20261001T180000Z");
    expect(prop(ics, "DTEND")).toBe("20261001T193000Z");
    expect(prop(ics, "SUMMARY")).toBe("Bina ve İzhar Şerhi — Açılış");
    expect(prop(ics, "URL")).toBe(PAGE);
    expect(prop(ics, "LOCATION")).toBe(PAGE);
    expect(prop(ics, "DESCRIPTION")).toBe(
      `Toplantı bağlantısı oturum sayfasındadır:\\n${PAGE}`
    );
  });

  it("uses CRLF line endings and ends with one", () => {
    const ics = buildLessonIcs(input());
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("writes times in UTC only, so the calendar converts to the viewer's zone", () => {
    const ics = buildLessonIcs(input());
    expect(ics).not.toContain("TZID");
    expect(prop(ics, "DTSTART")).toMatch(/^\d{8}T\d{6}Z$/);
  });

  it("leaves DTEND out when the session has no length", () => {
    const ics = buildLessonIcs(input({ durationMinutes: null }));
    expect(prop(ics, "DTEND")).toBeUndefined();
    expect(lessonEnd(new Date(0), null)).toBeNull();
  });

  it("links the session page and nothing else", () => {
    const ics = buildLessonIcs(input());
    const urls = unfold(ics)
      .join("\n")
      .match(/https?:\/\/[^\s\\]+/g);
    expect(new Set(urls)).toEqual(new Set([PAGE]));
  });

  it("writes the description in the requested language", () => {
    const en = buildLessonIcs({ ...input(), locale: "en" });
    expect(prop(en, "DESCRIPTION")).toBe(
      `The meeting link is on the session page:\\n${PAGE}`
    );
    const ar = buildLessonIcs({ ...input(), locale: "ar" });
    expect(prop(ar, "DESCRIPTION")).toContain("رابط الاجتماع");
  });

  it("escapes TEXT values", () => {
    expect(escapeIcsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    const ics = buildLessonIcs({
      ...input({ title: "Sarf; 1, 2" }),
    });
    expect(prop(ics, "SUMMARY")).toBe("Bina ve İzhar Şerhi — Sarf\\; 1\\, 2");
  });

  it("folds at 75 octets without splitting a character", () => {
    const line = `SUMMARY:${"ş".repeat(100)}`;
    const folded = foldIcsLine(line);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(Buffer.byteLength(part, "utf8")).toBeLessThanOrEqual(75);
      expect(part).not.toContain("\uFFFD");
    }
    expect(parts.slice(1).every((p) => p.startsWith(" "))).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });

  it("formats a UTC DATE-TIME without milliseconds", () => {
    expect(formatIcsUtc(new Date("2026-03-29T00:59:59.999Z"))).toBe(
      "20260329T005959Z"
    );
  });

  it("builds the session page URL without a locale prefix", () => {
    expect(PAGE).toBe(
      `https://tedris.example/courses/${COURSE_ID}/lessons/${LESSON_ID}`
    );
  });
});
