import {
  courseResourceKey,
  lessonAssignmentFileKey,
  lessonResourceKey,
  submissionFileKey,
} from "../../../src/storage/storage-keys";

const COURSE = "0b9c1e52-1111-4a5e-9d55-6b1f0c2a7e01";
const LESSON = "5d6e7f80-2222-4b3c-8d9e-0a1b2c3d4e5f";
const USER = "623fdf08-fd0e-481b-a927-4a1c15135e62";
const UUID =
  "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

/**
 * MDRS-287 / MDRS-290: storage keys are built by tedrisat alone, from the
 * environment's prefix, ids it read itself and a fresh uuid — never from
 * anything a user typed.
 */
describe("storage keys (MDRS-287, MDRS-290)", () => {
  it("files a course's resource under the course", () => {
    expect(courseResourceKey("prod", COURSE)).toMatch(
      new RegExp(`^prod/courses/${COURSE}/resources/${UUID}$`)
    );
  });

  it("files a celse's resource under the course and the celse", () => {
    expect(lessonResourceKey("local-dev", COURSE, LESSON)).toMatch(
      new RegExp(
        `^local-dev/courses/${COURSE}/lessons/${LESSON}/resources/${UUID}$`
      )
    );
  });

  it("files the homework set on a celse under the celse, apart from its resources", () => {
    expect(lessonAssignmentFileKey("prod", COURSE, LESSON)).toMatch(
      new RegExp(
        `^prod/courses/${COURSE}/lessons/${LESSON}/assignment/${UUID}$`
      )
    );
    expect(() => lessonAssignmentFileKey("prod", COURSE, "../x")).toThrow(
      /lessonId/
    );
  });

  it("files a talebe's homework under the celse and the talebe", () => {
    expect(submissionFileKey("prod", COURSE, LESSON, USER)).toMatch(
      new RegExp(
        `^prod/courses/${COURSE}/lessons/${LESSON}/submissions/${USER}/${UUID}$`
      )
    );
  });

  it("never gives the same key twice", () => {
    const keys = new Set(
      Array.from({ length: 200 }, () => courseResourceKey("prod", COURSE))
    );
    expect(keys.size).toBe(200);
  });

  it("lower-cases the ids, as Postgres prints them", () => {
    expect(courseResourceKey("prod", COURSE.toUpperCase())).toContain(
      `/courses/${COURSE}/`
    );
  });

  it("refuses a part that is not what it should be, rather than write somewhere unexpected", () => {
    expect(() => courseResourceKey("prod", "../other")).toThrow(/courseId/);
    expect(() => courseResourceKey("Prod/x", COURSE)).toThrow(/prefix/);
    expect(() => courseResourceKey("", COURSE)).toThrow(/prefix/);
    expect(() => submissionFileKey("prod", COURSE, LESSON, "me")).toThrow(
      /userId/
    );
  });
});
