import {
  AUTHZ_KEY,
  AUTHZ_PUBLIC_KEY,
  type AuthzMeta,
  ENTITIES,
  MATRIX,
  ROLES,
  SCOPES,
} from "@medaris/common";
import { describe, expect, it } from "vitest";
import { MuderrisDuplicateUserError } from "../../../src/course/errors/muderris-duplicate-user.error";
import { planCourseTeam } from "../../../src/madrasah/course/course-team";
import {
  CourseImamNotListedError,
  CourseImamRequiredError,
} from "../../../src/madrasah/course/errors";
import { MadrasahCourseController } from "../../../src/madrasah/course/madrasah-course.controller";
import { MadrasahController } from "../../../src/madrasah/madrasah.controller";

/**
 * MDRS-186: the müderris and imam rule of nazir/08 and nazir/17, and who may
 * call the routes behind nazir/07, 08, 17 and 18. The routes' database
 * behaviour is covered end to end in test/e2e/madrasah-course.e2e.spec.ts;
 * these run without a container.
 */
const A = "e6000000-0000-4000-8000-00000000000a";
const B = "e6000000-0000-4000-8000-00000000000b";
const C = "e6000000-0000-4000-8000-00000000000c";

describe("planCourseTeam", () => {
  it("makes a lone müderris the imam", () => {
    expect(planCourseTeam([A])).toEqual({ userIds: [A], imamUserId: A });
    expect(planCourseTeam([A], A)).toEqual({ userIds: [A], imamUserId: A });
  });

  it("takes the imam from the several, keeping the order they were listed in", () => {
    expect(planCourseTeam([B, A, C], A)).toEqual({
      userIds: [B, A, C],
      imamUserId: A,
    });
  });

  it("lowercases the accounts, so one id is one account", () => {
    expect(planCourseTeam([A.toUpperCase(), B], B.toUpperCase())).toEqual({
      userIds: [A, B],
      imamUserId: B,
    });
  });

  it("asks for the imam when there are several", () => {
    expect(() => planCourseTeam([A, B])).toThrow(CourseImamRequiredError);
  });

  it("refuses an imam who is not one of them", () => {
    expect(() => planCourseTeam([A, B], C)).toThrow(CourseImamNotListedError);
    expect(() => planCourseTeam([A], B)).toThrow(CourseImamNotListedError);
  });

  it("refuses an account listed twice, whatever its case", () => {
    expect(() => planCourseTeam([A, A.toUpperCase()], A)).toThrow(
      MuderrisDuplicateUserError
    );
  });
});

describe("authorization of the nazir/07, 08, 17 and 18 routes", () => {
  const routes: Array<[string, (...args: never[]) => unknown]> = [
    ["GET courses", MadrasahController.prototype.findCourses],
    ["GET hosting-kosks", MadrasahCourseController.prototype.hostingKosks],
    ["POST courses", MadrasahCourseController.prototype.open],
    [
      "PUT courses/:courseId/muderrises",
      MadrasahCourseController.prototype.setMuderris,
    ],
    ["POST courses/:courseId/hide", MadrasahCourseController.prototype.hide],
  ];

  it.each(
    routes
  )("%s is never open to a caller with no token", (_name, handler) => {
    expect(Reflect.getMetadata(AUTHZ_PUBLIC_KEY, handler)).toBeUndefined();
  });

  it.each(
    routes
  )("%s needs the scope only a medrese's başmüderris holds", (_name, handler) => {
    const meta = Reflect.getMetadata(AUTHZ_KEY, handler) as AuthzMeta;
    expect(meta.scope).toBe(SCOPES.MANAGE_MADRASAH);
    const holders = Object.entries(MATRIX[ENTITIES.MADRASAH])
      .filter(([, scopes]) => scopes?.includes(meta.scope))
      .map(([role]) => role);
    // A köşk's nazım is a stranger to the medrese (PUBLIC), like a caller with
    // no token (ANONYMOUS): both get 403.
    expect(holders).toEqual([ROLES.MADRASAH_NAZIR]);
  });
});
