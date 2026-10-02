import {
  expandWeeklyPattern,
  localDateOf,
  placeInWeeks,
} from "../../../src/course/domain/weekly-pattern";

describe("placeInWeeks (nizam/55)", () => {
  const fridays = expandWeeklyPattern({
    weekdays: [5],
    startTime: "21:00",
    timeZone: "Europe/Istanbul",
    startDate: "2026-10-09",
    endDate: "2026-10-23",
  });

  it("keeps the pattern's own numbering when the course has no dated week", () => {
    expect(placeInWeeks(fridays, [])).toEqual([1, 2, 3]);
  });

  it("puts a date into the existing week that holds it and counts on from there", () => {
    expect(
      placeInWeeks(fridays, [{ weekNumber: 6, from: "2026-10-09" }])
    ).toEqual([6, 7, 8]);
  });

  it("uses the week that starts latest on or before the date", () => {
    const weeks = [
      { weekNumber: 4, from: "2026-09-25" },
      { weekNumber: 5, from: "2026-10-02" },
      { weekNumber: 6, from: "2026-10-09" },
    ];
    expect(placeInWeeks(fridays, weeks)).toEqual([6, 7, 8]);
  });

  it("counts back from the first week for a date before every week, never below 1", () => {
    const early = expandWeeklyPattern({
      weekdays: [5],
      startTime: "21:00",
      timeZone: "Europe/Istanbul",
      startDate: "2026-09-04",
      endDate: "2026-09-18",
    });
    expect(
      placeInWeeks(early, [{ weekNumber: 2, from: "2026-09-25" }])
    ).toEqual([1, 1, 1]);
  });
});

describe("localDateOf", () => {
  it("reads the calendar date in the zone, not in UTC", () => {
    const instant = new Date("2026-10-08T22:30:00Z");
    expect(localDateOf(instant, "Europe/Istanbul")).toBe("2026-10-09");
    expect(localDateOf(instant, "UTC")).toBe("2026-10-08");
  });
});
