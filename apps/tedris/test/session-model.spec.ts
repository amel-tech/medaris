import type {
  CourseDetailResponse,
  LessonResponse,
  WeekResponse,
} from "@medaris/services/tedrisat";
import { describe, expect, it } from "vitest";
import {
  actionCaseOf,
  attendanceOf,
  celseNumberOf,
  celseTimeWords,
  currentAgendaStep,
  dayInZone,
  sessionStateOf,
  splitArabic,
  syllabusOf,
  timeUntil,
  zoneLabel,
} from "~/features/courses/session-model";

const NOW = new Date("2026-10-03T17:52:00.000Z");
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

describe("sessionStateOf (MDRS-158)", () => {
  const state = (
    startsAt: Date | null,
    durationMinutes: number | null,
    cancelledAt: Date | null = null
  ) => sessionStateOf({ startsAt, durationMinutes, cancelledAt }, NOW);

  it("is cancelled whenever it was cancelled", () => {
    expect(state(at(-500), 45, NOW)).toBe("cancelled");
    expect(state(at(60), 45, NOW)).toBe("cancelled");
  });

  it("follows the clock: upcoming, live from the start, ended from the end", () => {
    expect(state(at(8), 60)).toBe("upcoming");
    expect(state(null, 60)).toBe("upcoming");
    expect(state(at(0), 60)).toBe("live");
    expect(state(at(-59), 60)).toBe("live");
    expect(state(at(-60), 60)).toBe("ended");
  });

  it("gives a session with no length an hour, as tedrisat does", () => {
    expect(state(at(-59), null)).toBe("live");
    expect(state(at(-60), null)).toBe("ended");
  });
});

const lesson = (
  id: string,
  over: Partial<LessonResponse> = {}
): LessonResponse =>
  ({
    id,
    weekId: "w",
    title: id,
    type: "LIVE",
    durationMinutes: 45,
    scheduledAt: at(60),
    isPreview: false,
    orderIndex: 0,
    cancelledAt: null,
    replacementLessonId: null,
    ...over,
  }) as LessonResponse;

const week = (weekNumber: number, ...lessons: LessonResponse[]): WeekResponse =>
  ({
    id: `week-${weekNumber}`,
    courseId: "c",
    weekNumber,
    title: `Hafta ${weekNumber}`,
    summary: null,
    orderIndex: weekNumber,
    lessons,
  }) as WeekResponse;

const course = (...weeks: WeekResponse[]) =>
  ({ weeks, timeZone: "Europe/Istanbul" }) as CourseDetailResponse;

describe("celseNumberOf (MDRS-289)", () => {
  const programme = course(
    week(4, lesson("a")),
    week(
      5,
      lesson("b", { cancelledAt: at(-10) }),
      lesson("doc", { type: "DOCUMENT" }),
      lesson("c")
    )
  );

  it("counts the celse's place in its week, a cancelled one kept, other lesson types not", () => {
    expect(celseNumberOf(programme, "a")).toBe(1);
    expect(celseNumberOf(programme, "b")).toBe(1);
    expect(celseNumberOf(programme, "c")).toBe(2);
  });

  it("knows none for a celse the course does not list", () => {
    expect(celseNumberOf(programme, "x")).toBeNull();
    expect(celseNumberOf(course(), "a")).toBeNull();
  });
});

describe("syllabusOf (MDRS-289)", () => {
  const ids = (rows: { lesson: LessonResponse }[]) =>
    rows.map((row) => row.lesson.id);
  const seven = course(
    week(1, lesson("s1", { scheduledAt: at(-7 * 24 * 60) })),
    week(
      2,
      lesson("s2", { scheduledAt: at(-30) }),
      lesson("s3", { scheduledAt: at(60), cancelledAt: at(-5) })
    ),
    week(3, lesson("s4", { scheduledAt: at(24 * 60) })),
    week(4, lesson("doc", { type: "DOCUMENT" }), lesson("s5")),
    week(5, lesson("s6"), lesson("s7"))
  );

  it("keeps five celses around the one on the page, in programme order", () => {
    const { rows } = syllabusOf(seven, "s4", NOW);
    expect(ids(rows)).toEqual(["s2", "s3", "s4", "s5", "s6"]);
    expect(
      rows.filter((row) => row.viewing).map((row) => row.lesson.id)
    ).toEqual(["s4"]);
    expect(rows.map((row) => row.weekNumber)).toEqual([2, 2, 3, 4, 5]);
  });

  it("moves the window inward at either end, so it stays full", () => {
    expect(ids(syllabusOf(seven, "s1", NOW).rows)).toEqual([
      "s1",
      "s2",
      "s3",
      "s4",
      "s5",
    ]);
    expect(ids(syllabusOf(seven, "s7", NOW).rows)).toEqual([
      "s3",
      "s4",
      "s5",
      "s6",
      "s7",
    ]);
  });

  it("says where each stands on the clock, a cancelled one marked", () => {
    const states = Object.fromEntries(
      syllabusOf(seven, "s1", NOW, 7).rows.map((row) => [
        row.lesson.id,
        row.state,
      ])
    );
    expect(states).toEqual({
      s1: "ended",
      s2: "live",
      s3: "cancelled",
      s4: "upcoming",
      s5: "upcoming",
      s6: "upcoming",
      s7: "upcoming",
    });
  });

  it("counts the celses that stand", () => {
    expect(syllabusOf(seven, "s1", NOW).count).toBe(6);
  });

  it("starts from the top when the page's celse is not listed", () => {
    expect(ids(syllabusOf(seven, "x", NOW, 2).rows)).toEqual(["s1", "s2"]);
    expect(syllabusOf(course(), "x", NOW)).toEqual({ rows: [], count: 0 });
  });
});

describe("currentAgendaStep (MDRS-289)", () => {
  // 21:00 in İstanbul is 18:00Z.
  const start = new Date("2026-10-03T18:00:00.000Z");
  const minute = (n: number) => new Date(start.getTime() + n * 60_000);
  const agenda = [{ time: "21:00" }, { time: "21:25" }, { time: "21:45" }];
  const step = (now: Date, steps = agenda, startsAt = start) =>
    currentAgendaStep(
      steps,
      { startsAt, durationMinutes: 60, timeZone: "Europe/Istanbul" },
      now
    );

  it("marks the step whose time has come while the celse is live", () => {
    expect(step(minute(0))).toBe(0);
    expect(step(minute(24))).toBe(0);
    expect(step(minute(25))).toBe(1);
    expect(step(minute(59))).toBe(2);
  });

  it("marks none before the start or after the end", () => {
    expect(step(minute(-1))).toBeNull();
    expect(step(minute(60))).toBeNull();
  });

  it("reads the steps on the course's clock past midnight", () => {
    const late = new Date("2026-10-03T20:20:00.000Z"); // 23:20 in İstanbul
    const steps = [{ time: "23:20" }, { time: "23:40" }, { time: "00:05" }];
    const at = (n: number) => new Date(late.getTime() + n * 60_000);
    expect(step(at(30), steps, late)).toBe(1);
    expect(step(at(46), steps, late)).toBe(2);
  });

  it("skips a time it cannot read, and marks none when none can be", () => {
    expect(step(minute(30), [{ time: "21:00" }, { time: "sonra" }])).toBe(0);
    expect(step(minute(30), [{ time: "—" }])).toBeNull();
  });
});

describe("timeUntil (MDRS-289)", () => {
  const after = (minutes: number) => at(minutes);

  it("says the two largest units", () => {
    expect(timeUntil(after(2 * 24 * 60 + 4 * 60 + 10), NOW, "tr")).toBe(
      "2 gün 4 saat"
    );
    expect(timeUntil(after(65), NOW, "tr")).toBe("1 saat 5 dakika");
    expect(timeUntil(after(45), NOW, "tr")).toBe("45 dakika");
    expect(timeUntil(after(24 * 60), NOW, "tr")).toBe("1 gün");
  });

  it("never says less than a minute, and speaks the page's language", () => {
    expect(timeUntil(new Date(NOW.getTime() + 5_000), NOW, "tr")).toBe(
      "1 dakika"
    );
    expect(timeUntil(after(2 * 24 * 60 + 4 * 60), NOW, "en")).toBe(
      "2 days 4 hours"
    );
  });
});

describe("celseTimeWords (MDRS-289)", () => {
  const late = new Date("2026-10-03T20:20:00.000Z"); // 23:20 in İstanbul

  it("words the day and the time on the course's clock, the end after the start", () => {
    expect(
      celseTimeWords(late, 60, {
        locale: "tr",
        courseTimeZone: "Europe/Istanbul",
        viewerTimeZone: "Europe/Istanbul",
      })
    ).toEqual({
      day: "3 Ekim Cumartesi",
      weekday: "Cumartesi",
      date: "3 Ekim",
      clock: "23:20–00:20",
      local: null,
    });
  });

  it("gives the start alone without a length, and the viewer's clock when it shows another time", () => {
    const words = celseTimeWords(late, null, {
      locale: "tr",
      courseTimeZone: "Europe/Istanbul",
      viewerTimeZone: "Asia/Tokyo",
    });
    expect(words.clock).toBe("23:20");
    expect(words.local).toBe("Paz 05:20");
    expect(
      celseTimeWords(new Date("2026-10-03T18:00:00.000Z"), 60, {
        locale: "tr",
        courseTimeZone: "Europe/Istanbul",
        viewerTimeZone: "Europe/Berlin",
      }).local
    ).toBe("20:00");
  });
});

describe("actionCaseOf and attendanceOf (MDRS-289)", () => {
  it("says a cancelled celse is cancelled whatever else it has, then the lock", () => {
    expect(
      actionCaseOf({
        state: "cancelled",
        locked: true,
        watch: "recording",
        hasLiveStream: true,
      })
    ).toBe("cancelled");
    expect(
      actionCaseOf({
        state: "live",
        locked: true,
        watch: null,
        hasLiveStream: true,
      })
    ).toBe("locked");
  });

  it("offers what the API sent to watch, or a stream from the start of a page drawn before it", () => {
    const of = (
      state: "upcoming" | "live" | "ended",
      watch: "recording" | "stream" | null,
      hasLiveStream: boolean
    ) => actionCaseOf({ state, locked: false, watch, hasLiveStream });
    expect(of("ended", "recording", false)).toBe("recording");
    expect(of("ended", "stream", true)).toBe("stream");
    expect(of("live", null, true)).toBe("stream");
    expect(of("upcoming", null, true)).toBe("date");
    expect(of("ended", null, true)).toBe("date");
    expect(of("live", null, false)).toBe("date");
  });

  it("keeps the link the way in, then says how the celse is held (MDRS-283)", () => {
    const of = (hasLink: boolean, inPerson: boolean, hasLiveStream: boolean) =>
      attendanceOf({ hasLink, inPerson, hasLiveStream });
    expect(of(true, true, true)).toBe("link");
    expect(of(false, true, true)).toBe("inPersonStream");
    expect(of(false, false, true)).toBe("stream");
    expect(of(false, true, false)).toBe("inPerson");
    expect(of(false, false, false)).toBe("none");
  });
});

describe("dayInZone", () => {
  it("reads the day in the zone, not in UTC", () => {
    const late = new Date("2026-10-03T22:30:00.000Z");
    expect(dayInZone(late, "Europe/Istanbul")).toBe("2026-10-04");
    expect(dayInZone(late, "UTC")).toBe("2026-10-03");
  });
});

describe("zoneLabel", () => {
  it("names Istanbul in each locale and falls back to the IANA city", () => {
    expect(zoneLabel("Europe/Istanbul", "tr")).toBe("İstanbul");
    expect(zoneLabel("Europe/Istanbul", "en")).toBe("Istanbul");
    expect(zoneLabel("America/New_York", "tr")).toBe("New York");
  });
});

describe("splitArabic", () => {
  it("sets each Arabic run apart from the Turkish around it", () => {
    expect(splitArabic("قرأ fiilinin mâzî ve muzâri çekimi")).toEqual([
      { text: "قرأ", arabic: true },
      { text: " fiilinin mâzî ve muzâri çekimi", arabic: false },
    ]);
    expect(
      splitArabic("Örnek çekimler: سأل ve أمر").map((p) => p.arabic)
    ).toEqual([false, true, false, true]);
    expect(splitArabic("Kapanış")).toEqual([
      { text: "Kapanış", arabic: false },
    ]);
    expect(splitArabic("")).toEqual([]);
  });
});
