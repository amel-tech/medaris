import { PERMISSIONS } from "../../../src/assignment/permission-catalog";
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
});
