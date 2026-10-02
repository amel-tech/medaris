import type { ScheduleSessionResponse } from "@medaris/services/tedrisat";
import { describe, expect, it } from "vitest";
import {
  addDays,
  dayLabel,
  daysBetween,
  formatClock,
  formatDayHeading,
  groupByDay,
  parseDay,
  scheduleWindow,
  startOfDay,
} from "~/features/schedule/schedule-model";

const IST = "Europe/Istanbul";
const session = (id: string, startsAt: string): ScheduleSessionResponse =>
  ({ id, startsAt: new Date(startsAt) }) as ScheduleSessionResponse;

describe("Programım's window (MDRS-163, design tedris/21)", () => {
  it("reads only a real calendar day", () => {
    expect(parseDay("2026-10-08")).toBe("2026-10-08");
    for (const bad of [
      undefined,
      "",
      "bugün",
      "2026-13-01",
      "2026-02-30",
      "2026-10-8",
    ]) {
      expect(parseDay(bad)).toBeNull();
    }
  });

  it("moves a day by calendar days across month and year ends", () => {
    expect(addDays("2026-10-01", 7)).toBe("2026-10-08");
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
    expect(daysBetween("2026-10-01", "2026-10-03")).toBe(2);
  });

  it("starts a day at local midnight: 21:00 UTC the evening before in Istanbul", () => {
    expect(startOfDay("2026-10-01", IST).toISOString()).toBe(
      "2026-09-30T21:00:00.000Z"
    );
  });

  it("follows daylight saving: New York is UTC-4 in October and UTC-5 after the change", () => {
    expect(startOfDay("2026-10-01", "America/New_York").toISOString()).toBe(
      "2026-10-01T04:00:00.000Z"
    );
    expect(startOfDay("2026-11-02", "America/New_York").toISOString()).toBe(
      "2026-11-02T05:00:00.000Z"
    );
  });

  it("is seven days from today when nothing is asked", () => {
    // 22:30 UTC on 1 Oct is already 2 Oct in Istanbul.
    const w = scheduleWindow(undefined, new Date("2026-10-01T22:30:00Z"), IST);
    expect(w.today).toBe("2026-10-02");
    expect(w.fromDay).toBe("2026-10-02");
    expect(w.from).toBe("2026-10-01T21:00:00.000Z");
    expect(w.to).toBe("2026-10-08T21:00:00.000Z");
    expect(w.nextFromDay).toBe("2026-10-09");
  });

  it("honours a later ?from=, and falls back to today for a past or bad one", () => {
    const now = new Date("2026-10-01T09:00:00Z");
    expect(scheduleWindow("2026-10-08", now, IST).fromDay).toBe("2026-10-08");
    expect(scheduleWindow("2026-09-01", now, IST).fromDay).toBe("2026-10-01");
    expect(scheduleWindow("x", now, IST).fromDay).toBe("2026-10-01");
  });
});

describe("Programım's day groups", () => {
  it("groups by the day in the viewer's zone, keeping order", () => {
    const groups = groupByDay(
      [
        session("a", "2026-10-03T18:00:00Z"),
        session("b", "2026-10-04T17:00:00Z"),
        session("c", "2026-10-04T18:00:00Z"),
        session("d", "2026-10-06T18:00:00Z"),
      ],
      IST
    );
    // 17:00 UTC is 20:00 on the 4th in Istanbul; 18:00 UTC is 21:00 on the 4th.
    expect(groups.map((g) => [g.day, g.sessions.map((s) => s.id)])).toEqual([
      ["2026-10-03", ["a"]],
      ["2026-10-04", ["b", "c"]],
      ["2026-10-06", ["d"]],
    ]);
  });

  it("puts 21:00 and 03:00 the next morning of one evening on different days", () => {
    const groups = groupByDay(
      [
        session("late", "2026-10-03T20:30:00Z"),
        session("night", "2026-10-03T21:30:00Z"),
      ],
      IST
    );
    expect(groups.map((g) => g.day)).toEqual(["2026-10-03", "2026-10-04"]);
  });

  it("labels a day by its distance from today", () => {
    const today = "2026-10-01";
    expect(dayLabel("2026-10-01", today)).toEqual({ kind: "today" });
    expect(dayLabel("2026-10-02", today)).toEqual({ kind: "tomorrow" });
    expect(dayLabel("2026-10-03", today)).toEqual({ kind: "dayAfter" });
    expect(dayLabel("2026-10-06", today)).toEqual({ kind: "inDays", count: 5 });
  });

  it("writes the heading and the clock as the design does", () => {
    expect(formatDayHeading("2026-10-03", "tr", IST)).toBe("3 Ekim Cumartesi");
    expect(formatClock("2026-10-03T18:00:00Z", "tr", IST)).toBe("21:00");
  });
});
