import type {
  CourseDetailResponse,
  LessonResponse,
  WeekResponse,
} from "@medaris/services/tedrisat";
import { describe, expect, it } from "vitest";
import {
  buildProgramme,
  dayInZone,
  sessionStateOf,
  splitArabic,
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

describe("buildProgramme (MDRS-158)", () => {
  const past = (id: string) => lesson(id, { scheduledAt: at(-60 * 24 * 7) });
  const result = buildProgramme(
    course(
      week(1, past("a"), past("b")),
      week(
        5,
        lesson("now", { scheduledAt: at(8), durationMinutes: 60 }),
        lesson("cancelled", {
          scheduledAt: at(60 * 24),
          cancelledAt: NOW,
          replacementLessonId: "makeup",
        }),
        lesson("makeup", { scheduledAt: at(60 * 24 * 4) })
      ),
      week(
        6,
        lesson("later", { scheduledAt: new Date("2026-10-10T18:00:00Z") })
      ),
      week(7)
    ),
    NOW
  );

  it("marks the first week that is not over as active and the finished ones as done", () => {
    expect(result.weeks.map((w) => w.state)).toEqual([
      "done",
      "active",
      "default",
      "default",
    ]);
  });

  it("marks the next standing session as the one up next, never a cancelled one", () => {
    expect(result.nextLessonId).toBe("now");
    const rows = result.weeks[1].rows;
    expect(rows.map((r) => r.state)).toEqual(["current", "default", "default"]);
    expect(rows[1].cancelled).toBe(true);
    expect(result.weeks[0].rows.map((r) => r.state)).toEqual(["done", "done"]);
  });

  it("marks the row of a session on air as live, and only that one", () => {
    const onAir = buildProgramme(
      course(
        week(
          1,
          lesson("air", { scheduledAt: at(-14), durationMinutes: 60 }),
          lesson("later", { scheduledAt: at(60 * 24) })
        )
      ),
      NOW
    );
    expect(onAir.weeks[0].rows.map((r) => [r.state, r.live])).toEqual([
      ["current", true],
      ["default", false],
    ]);
    expect(result.weeks[1].rows.every((r) => !r.live)).toBe(true);
  });

  it("counts only the sessions that stand, and their minutes", () => {
    const { sessionCount, minutes } = result.weeks[1];
    expect(sessionCount).toBe(2);
    expect(minutes).toBe(60 + 45);
  });

  it("gives a week still ahead the day its first session falls on, in the course's zone", () => {
    expect(result.weeks[2].opensOn).toBe("2026-10-10");
    expect(result.weeks[3].opensOn).toBeUndefined();
    expect(result.weeks[1].opensOn).toBeUndefined();
  });

  it("reads the day in the zone, not in UTC", () => {
    // 22:30 on 3 October in UTC is already the 4th in Istanbul.
    const late = new Date("2026-10-03T22:30:00Z");
    expect(dayInZone(late, "Europe/Istanbul")).toBe("2026-10-04");
    expect(dayInZone(late, "UTC")).toBe("2026-10-03");
  });

  it("has no session up next when everything is over", () => {
    const over = buildProgramme(
      course(week(1, lesson("a", { scheduledAt: at(-9000) }))),
      NOW
    );
    expect(over.nextLessonId).toBeNull();
    expect(over.weeks[0].state).toBe("done");
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
