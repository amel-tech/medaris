import { InvalidScheduleWindowError } from "../../../src/schedule/errors/invalid-schedule-window.error";
import {
  MAX_WINDOW_DAYS,
  parseScheduleWindow,
} from "../../../src/schedule/schedule-window";

describe("parseScheduleWindow (MDRS-163)", () => {
  it("reads a date-time with an offset as that instant", () => {
    const { from, to } = parseScheduleWindow(
      "2026-10-01T00:00:00+03:00",
      "2026-10-08T00:00:00+03:00"
    );
    expect(from.toISOString()).toBe("2026-09-30T21:00:00.000Z");
    expect(to.toISOString()).toBe("2026-10-07T21:00:00.000Z");
  });

  it("reads a bare date as UTC midnight", () => {
    const { from } = parseScheduleWindow("2026-10-01", "2026-10-08");
    expect(from.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it.each([
    [undefined, "2026-10-08"],
    ["2026-10-01", undefined],
    ["yesterday", "2026-10-08"],
    ["2026-10-01", "Oct 8 2026"],
    ["2026-13-45", "2026-10-08"],
    ["2026-10-01T10:00:00", "2026-10-08"],
  ])("refuses from=%s to=%s", (from, to) => {
    expect(() => parseScheduleWindow(from, to)).toThrow(
      InvalidScheduleWindowError
    );
  });

  it("refuses an empty or inverted window", () => {
    expect(() => parseScheduleWindow("2026-10-08", "2026-10-08")).toThrow(
      InvalidScheduleWindowError
    );
    expect(() => parseScheduleWindow("2026-10-08", "2026-10-01")).toThrow(
      InvalidScheduleWindowError
    );
  });

  it("refuses a window longer than the cap", () => {
    expect(() => parseScheduleWindow("2026-10-01", "2026-11-02")).toThrow(
      InvalidScheduleWindowError
    );
    expect(MAX_WINDOW_DAYS).toBe(31);
    expect(() => parseScheduleWindow("2026-10-01", "2026-11-01")).not.toThrow();
  });
});
