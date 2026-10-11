import {
  buildLessonIcs,
  type CalendarAttendance,
  type CalendarLessonInput,
  calendarAttendanceKind,
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
  attendance: { inPerson: false, hasMeetingLink: true, hasLiveStream: false },
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
const zoned = (ics: string, name: string) =>
  unfold(ics)
    .find((l) => l.startsWith(`${name};TZID=Europe/Istanbul:`))
    ?.split(":")[1];

describe("lesson calendar (MDRS-117)", () => {
  it("writes one VEVENT with the fields the issue lists", () => {
    const ics = buildLessonIcs(input());
    const lines = unfold(ics);
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(1);
    expect(prop(ics, "UID")).toBe(`lesson-${LESSON_ID}@medaris.app`);
    expect(prop(ics, "DTSTAMP")).toBe("20260928T091530Z");
    expect(prop(ics, "SEQUENCE")).toBe("7");
    expect(zoned(ics, "DTSTART")).toBe("20261001T210000");
    expect(zoned(ics, "DTEND")).toBe("20261001T223000");
    expect(prop(ics, "SUMMARY")).toBe("Bina ve İzhar Şerhi — Açılış");
    expect(prop(ics, "URL")).toBe(PAGE);
    expect(prop(ics, "LOCATION")).toBe(PAGE);
    // "celse", as everywhere else, not "oturum" (MDRS-283).
    expect(prop(ics, "DESCRIPTION")).toBe(
      `Toplantı bağlantısı celse sayfasındadır:\\n${PAGE}`
    );
  });

  it("uses CRLF line endings and ends with one", () => {
    const ics = buildLessonIcs(input());
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("writes the event in Europe/Istanbul with a VTIMEZONE; DTSTAMP stays UTC", () => {
    const ics = buildLessonIcs(input());
    expect(ics).toContain("BEGIN:VTIMEZONE\r\nTZID:Europe/Istanbul");
    expect(ics).toContain("TZOFFSETTO:+0300");
    expect(zoned(ics, "DTSTART")).toMatch(/^\d{8}T\d{6}$/);
    expect(prop(ics, "DTSTAMP")).toMatch(/^\d{8}T\d{6}Z$/);
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

  it("marks a cancelled session STATUS:CANCELLED, keeping its UID (MDRS-163)", () => {
    const planned = buildLessonIcs(input());
    const cancelled = buildLessonIcs({ ...input(), cancelled: true });
    expect(prop(planned, "STATUS")).toBeUndefined();
    expect(prop(cancelled, "STATUS")).toBe("CANCELLED");
    expect(prop(cancelled, "UID")).toBe(prop(planned, "UID"));
  });
});

/**
 * MDRS-283: the description names the meeting link only where the session can
 * have one. A session held in person and one that is only streamed get their
 * own line, in each of the three languages; the page's URL follows every one.
 */
describe("lesson calendar description by attendance (MDRS-283)", () => {
  const attended = (attendance: Partial<CalendarAttendance>) => ({
    inPerson: false,
    hasMeetingLink: false,
    hasLiveStream: false,
    ...attendance,
  });
  const description = (
    attendance: Partial<CalendarAttendance>,
    locale: CalendarLessonInput["locale"] = "tr"
  ) =>
    prop(
      buildLessonIcs({ ...input(), attendance: attended(attendance), locale }),
      "DESCRIPTION"
    );

  it("picks the line by what the session has", () => {
    expect(calendarAttendanceKind(attended({ hasMeetingLink: true }))).toBe(
      "MEETING"
    );
    // Nothing yet: the session still needs its link.
    expect(calendarAttendanceKind(attended({}))).toBe("MEETING");
    // A meeting link and a stream: the link is where talebe join.
    expect(
      calendarAttendanceKind(
        attended({ hasMeetingLink: true, hasLiveStream: true })
      )
    ).toBe("MEETING");
    expect(calendarAttendanceKind(attended({ hasLiveStream: true }))).toBe(
      "STREAM"
    );
    expect(calendarAttendanceKind(attended({ inPerson: true }))).toBe(
      "IN_PERSON"
    );
    // Hybrid: held in person, with a meeting link for whoever joins from afar.
    expect(
      calendarAttendanceKind(attended({ inPerson: true, hasMeetingLink: true }))
    ).toBe("IN_PERSON_MEETING");
    // ... and with a stream too: the link is the way in, as without the mark.
    expect(
      calendarAttendanceKind(
        attended({ inPerson: true, hasMeetingLink: true, hasLiveStream: true })
      )
    ).toBe("IN_PERSON_MEETING");
    expect(
      calendarAttendanceKind(attended({ inPerson: true, hasLiveStream: true }))
    ).toBe("IN_PERSON_STREAM");
  });

  it("says a streamed session is streamed, not that its meeting link is on the page", () => {
    expect(description({ hasLiveStream: true })).toBe(
      `Bu celse canlı yayınlanır\\; yayın celse sayfasındadır:\\n${PAGE}`
    );
    expect(description({ hasLiveStream: true }, "en")).toBe(
      `This session is streamed live\\; the stream is on the session page:\\n${PAGE}`
    );
    const ar = description({ hasLiveStream: true }, "ar");
    expect(ar).toContain("بثًّا مباشرًا");
    expect(ar).not.toContain("رابط الاجتماع");
  });

  it("says an in-person session is held in person", () => {
    expect(description({ inPerson: true })).toBe(
      `Bu celse yüz yüze yapılır. Celse sayfası:\\n${PAGE}`
    );
    expect(description({ inPerson: true }, "en")).toBe(
      `This session is held in person. Session page:\\n${PAGE}`
    );
    const ar = description({ inPerson: true }, "ar");
    expect(ar).toContain("حضوريًّا");
    expect(ar).not.toContain("رابط الاجتماع");
  });

  it("says a hybrid session is held in person and its meeting link is on the page", () => {
    expect(description({ inPerson: true, hasMeetingLink: true })).toBe(
      `Bu celse yüz yüze yapılır\\; toplantı bağlantısı celse sayfasındadır:\\n${PAGE}`
    );
    expect(description({ inPerson: true, hasMeetingLink: true }, "en")).toBe(
      `This session is held in person\\; the meeting link is on the session page:\\n${PAGE}`
    );
    const ar = description({ inPerson: true, hasMeetingLink: true }, "ar");
    expect(ar).toContain("حضوريًّا");
    expect(ar).toContain("رابط الاجتماع");
  });

  it("says an in-person session with a stream is both", () => {
    expect(description({ inPerson: true, hasLiveStream: true })).toBe(
      `Bu celse yüz yüze yapılır ve canlı yayınlanır\\; yayın celse sayfasındadır:\\n${PAGE}`
    );
    expect(description({ inPerson: true, hasLiveStream: true }, "en")).toBe(
      `This session is held in person and streamed live\\; the stream is on the session page:\\n${PAGE}`
    );
    const ar = description({ inPerson: true, hasLiveStream: true }, "ar");
    expect(ar).toContain("حضوريًّا");
    expect(ar).toContain("بثًّا مباشرًا");
  });

  it("never says 'oturum', in any of the lines", () => {
    for (const a of [
      {},
      { hasMeetingLink: true },
      { hasLiveStream: true },
      { inPerson: true },
      { inPerson: true, hasMeetingLink: true },
      { inPerson: true, hasLiveStream: true },
    ]) {
      expect(description(a)).not.toContain("oturum");
    }
  });
});
