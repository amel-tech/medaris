import type { EnrolledCourseResponse } from "@medaris/services/tedrisat";
import { describe, expect, it } from "vitest";
import {
  formatLongDate,
  formatSessionMoment,
  splitMyCourses,
} from "~/features/courses/my-courses";

const course = (id: string, status: string): EnrolledCourseResponse =>
  ({ id, title: id, enrollment: { status } }) as EnrolledCourseResponse;

describe("Derslerim's sections (MDRS-159, design tedris/20)", () => {
  it("puts ENROLLED in Devam eden, PENDING in Başvurularım, COMPLETED in Tamamladığın", () => {
    const sections = splitMyCourses([
      course("a", "ENROLLED"),
      course("b", "PENDING"),
      course("c", "COMPLETED"),
      course("d", "ENROLLED"),
      course("e", "ENROLLED"),
    ]);
    expect(sections.ongoing.map((c) => c.id)).toEqual(["a", "d", "e"]);
    expect(sections.applications.map((c) => c.id)).toEqual(["b"]);
    expect(sections.completed.map((c) => c.id)).toEqual(["c"]);
  });

  it("counts every course once, so the headings agree with the lists", () => {
    const all = ["ENROLLED", "PENDING", "COMPLETED", "PENDING"].map((s, i) =>
      course(String(i), s)
    );
    const { ongoing, applications, completed } = splitMyCourses(all);
    expect(ongoing.length + applications.length + completed.length).toBe(
      all.length
    );
  });

  it("is four empty sections for no courses", () => {
    expect(splitMyCourses([])).toEqual({
      ongoing: [],
      applications: [],
      completed: [],
      revoked: [],
    });
  });
});

describe("Derslerim's dates", () => {
  it("writes a long date in the given zone", () => {
    expect(
      formatLongDate("2026-09-28T09:00:00.000Z", "tr", "Europe/Istanbul")
    ).toBe("28 Eylül 2026");
    // 22:30 UTC on the 27th is already the 28th in Istanbul
    expect(
      formatLongDate("2026-09-27T22:30:00.000Z", "tr", "Europe/Istanbul")
    ).toBe("28 Eylül 2026");
    expect(formatLongDate("nope", "tr", "Europe/Istanbul")).toBe("");
  });

  it("writes a session as day, weekday and clock", () => {
    // Saturday 3 October 2026, 21:00 in Istanbul
    expect(
      formatSessionMoment("2026-10-03T18:00:00.000Z", "tr", "Europe/Istanbul")
    ).toBe("3 Eki Cmt 21:00");
    expect(formatSessionMoment("nope", "tr", "Europe/Istanbul")).toBe("");
  });
});
