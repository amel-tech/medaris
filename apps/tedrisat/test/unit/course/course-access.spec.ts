import {
  COURSE_CODES,
  PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
} from "../../../src/assignment/permission-catalog";
import { standingCarries } from "../../../src/course/course-access.service";

/**
 * MDRS-228. Which roles carry a course permission by default — the rule
 * `CourseAccessService` applies before it looks for grants. The grant half
 * and the başnazım are covered against Postgres in
 * `test/e2e/live-stream.e2e.spec.ts`.
 */
describe("standingCarries — course permissions by role default", () => {
  const none = { koskNazim: false, muderris: false };

  it("gives session.live_link to the müderris and to the köşk nazımı", () => {
    expect(
      standingCarries(
        { ...none, muderris: true },
        PERMISSIONS.SESSION_LIVE_LINK
      )
    ).toBe(true);
    expect(
      standingCarries(
        { ...none, koskNazim: true },
        PERMISSIONS.SESSION_LIVE_LINK
      )
    ).toBe(true);
  });

  it("gives nothing to someone who holds neither role", () => {
    expect(standingCarries(none, PERMISSIONS.SESSION_LIVE_LINK)).toBe(false);
  });

  it("reads the köşk nazımı's course.manage_all as the course catalogue only", () => {
    // Defining permission groups is the müderris's default, not course work
    // the köşk's own permission opens.
    expect(
      standingCarries(
        { ...none, koskNazim: true },
        PERMISSIONS.PERMISSION_GROUP_DEFINE
      )
    ).toBe(false);
    expect(
      standingCarries(
        { ...none, muderris: true },
        PERMISSIONS.PERMISSION_GROUP_DEFINE
      )
    ).toBe(true);
  });

  it("does not stretch a course role to a platform permission", () => {
    expect(
      standingCarries(
        { koskNazim: true, muderris: true },
        PERMISSIONS.PLATFORM_AUDIT_READ
      )
    ).toBe(false);
  });

  it("gives question.answer to the müderris and the köşk nazımı, to no other role", () => {
    expect(
      standingCarries({ ...none, muderris: true }, PERMISSIONS.QUESTION_ANSWER)
    ).toBe(true);
    expect(
      standingCarries({ ...none, koskNazim: true }, PERMISSIONS.QUESTION_ANSWER)
    ).toBe(true);
    expect(standingCarries(none, PERMISSIONS.QUESTION_ANSWER)).toBe(false);
  });
});

describe("question.answer in the catalogue (MDRS-150)", () => {
  it("is a course permission: the müderris holds it and may hand it to a ders nazırı", () => {
    expect(ROLE_DEFAULT_PERMISSIONS.MUDERRIS).toContain("question.answer");
    expect(COURSE_CODES.has("question.answer")).toBe(true);
  });

  it("is held by no ders nazırı by default", () => {
    expect(ROLE_DEFAULT_PERMISSIONS.DERS_NAZIR).not.toContain(
      "question.answer"
    );
  });
});
