import { describe, expect, it } from "vitest";
import {
  firstSessionAt,
  formatFirstSession,
  isPreview,
} from "~/features/courses/preview";

const week = (...scheduled: Array<string | null>) => ({
  lessons: scheduled.map((scheduledAt) => ({
    scheduledAt: scheduledAt === null ? null : new Date(scheduledAt),
  })),
});
const course = (...weeks: ReturnType<typeof week>[]) => ({ weeks }) as never;

describe("tedris/14: the draft preview", () => {
  it("is a preview only for a DRAFT course", () => {
    expect(isPreview({ status: "DRAFT" })).toBe(true);
    expect(isPreview({ status: "PUBLISHED" })).toBe(false);
  });

  it("picks the earliest scheduledAt across weeks, not the first listed", () => {
    const first = firstSessionAt(
      course(
        week("2026-10-19T18:00:00Z", null),
        week("2026-10-12T18:00:00Z", "2026-10-26T18:00:00Z")
      )
    );
    expect(first?.toISOString()).toBe("2026-10-12T18:00:00.000Z");
  });

  it("is null when nothing is scheduled", () => {
    expect(firstSessionAt(course(week(null), week()))).toBeNull();
    expect(firstSessionAt(course())).toBeNull();
  });

  it("writes the day, month, weekday and clock in the course's zone", () => {
    const at = new Date("2026-10-12T18:00:00Z");
    expect(formatFirstSession(at, "tr", "Europe/Istanbul")).toBe(
      "12 Ekim Pazartesi 21:00"
    );
    expect(formatFirstSession(at, "tr", "Europe/London")).toBe(
      "12 Ekim Pazartesi 19:00"
    );
  });

  it("throws for a zone no calendar knows, which the error page answers (tedris/40)", () => {
    expect(() => formatFirstSession(new Date(), "tr", "Nope/Zone")).toThrow(
      RangeError
    );
  });
});
