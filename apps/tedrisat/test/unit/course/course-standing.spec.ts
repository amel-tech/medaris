import {
  ENTITIES,
  type IAuthzFacts,
  type IHeldGrantCodes,
  type IHeldRole,
  PERMISSIONS,
  RELATIONS,
  ROLE_DEFAULT_PERMISSIONS,
  SCOPE_TYPES,
} from "@medaris/common";
import { describe, expect, it } from "vitest";
import { COURSE_CATALOG } from "../../../src/assignment/permission-catalog";
import {
  courseStandingOf,
  GIVER_LEVEL,
} from "../../../src/course/nazir/course-standing";
import {
  ASSIGNED_ROLES,
  type AssignedRole,
} from "../../../src/database/schema/role-assignment.schema";
import { grantOf, heldRole } from "../../helpers/ban-holdings";

/**
 * MDRS-270: who gives, who only appoints, and who stays out of a course's ders
 * nazırları, read off the engine's own computation over what the caller
 * holds. Only a role's own `permission.grant` gives; a grant of
 * `course_nazir.assign` appoints; in a medrese course the köşk nazımı's seat
 * does not count.
 */
const KOSK = "a2700000-0000-4000-8000-0000000000aa";
const MADRASAH = "a2700000-0000-4000-8000-0000000000bb";
const COURSE = "a2700000-0000-4000-8000-0000000000cc";
const where = { koskId: KOSK, courseId: COURSE, madrasahId: MADRASAH };

const R = ASSIGNED_ROLES;
const P = PERMISSIONS;
const role = (r: AssignedRole): IHeldRole => heldRole(r, where);
const atCourse = { type: SCOPE_TYPES.COURSE, id: COURSE } as const;
const everyCourse = { type: SCOPE_TYPES.COURSE, id: null } as const;

/** The course as the loader hands it over: a köşk's own, or a medrese's. */
const factsOf = (inMadrasah: boolean): IAuthzFacts => ({
  entity: ENTITIES.COURSE,
  relation: RELATIONS.PUBLIC,
  chain: [
    atCourse,
    ...(inMadrasah ? [{ type: SCOPE_TYPES.MADRASAH, id: MADRASAH }] : []),
    { type: SCOPE_TYPES.KOSK, id: KOSK },
    { type: SCOPE_TYPES.PLATFORM, id: null },
  ],
  madrasahCourse: inMadrasah,
  passiveScope: null,
  policies: [],
});
const kosksCourse = factsOf(false);
const medreseCourse = factsOf(true);

const standing = (
  facts: IAuthzFacts,
  roles: IHeldRole[],
  grants: IHeldGrantCodes[] = []
) => courseStandingOf(facts, roles, grants);

describe("courseStandingOf (MDRS-270)", () => {
  it("makes the müderris a giver at the course's level", () => {
    for (const facts of [kosksCourse, medreseCourse]) {
      expect(standing(facts, [role(R.MUDERRIS)])).toEqual({
        kind: "giver",
        authority: "course",
      });
    }
  });

  it("makes the başmüderris a giver at the medrese's level in a medrese course", () => {
    expect(standing(medreseCourse, [role(R.MEDRESE_BASMUDERRIS)])).toEqual({
      kind: "giver",
      authority: "madrasah",
    });
    // teaching it as well, they still give at the higher of the two
    expect(
      standing(medreseCourse, [role(R.MUDERRIS), role(R.MEDRESE_BASMUDERRIS)])
    ).toEqual({ kind: "giver", authority: "madrasah" });
  });

  it("makes the köşk nazımı a giver at the köşk's level in a köşk's own course", () => {
    expect(standing(kosksCourse, [role(R.KOSK_NAZIM)])).toEqual({
      kind: "giver",
      authority: "kosk",
    });
  });

  it("leaves the köşk nazımı outside a medrese course", () => {
    expect(standing(medreseCourse, [role(R.KOSK_NAZIM)])).toEqual({
      kind: "outside",
    });
  });

  it("takes the müderris role of a köşk nazımı who also teaches a medrese course", () => {
    expect(
      standing(medreseCourse, [role(R.KOSK_NAZIM), role(R.MUDERRIS)])
    ).toEqual({ kind: "giver", authority: "course" });
  });

  it("makes a ders nazırı granted course_nazir.assign an appointer, not a giver", () => {
    const assign = grantOf([P.COURSE_NAZIR_ASSIGN], atCourse);
    expect(standing(kosksCourse, [role(R.DERS_NAZIR)], [assign])).toEqual({
      kind: "appointer",
    });
    // whatever else they hold
    const everything = grantOf([...COURSE_CATALOG], atCourse);
    expect(standing(medreseCourse, [role(R.DERS_NAZIR)], [everything])).toEqual(
      { kind: "appointer" }
    );
    expect(standing(kosksCourse, [role(R.DERS_NAZIR)])).toEqual({
      kind: "outside",
    });
  });

  it("makes a Medaris nazımı with an every-course grant an appointer", () => {
    const assign = grantOf([P.COURSE_NAZIR_ASSIGN], everyCourse);
    for (const facts of [kosksCourse, medreseCourse]) {
      expect(standing(facts, [role(R.MEDARIS_NAZIM)], [assign])).toEqual({
        kind: "appointer",
      });
    }
    expect(standing(kosksCourse, [role(R.MEDARIS_NAZIM)])).toEqual({
      kind: "outside",
    });
  });

  it("ignores a grant of permission.grant", () => {
    const smuggled = grantOf([P.PERMISSION_GRANT], atCourse);
    expect(standing(kosksCourse, [role(R.DERS_NAZIR)], [smuggled])).toEqual({
      kind: "outside",
    });
    expect(
      standing(
        kosksCourse,
        [role(R.DERS_NAZIR)],
        [grantOf([P.PERMISSION_GRANT, P.COURSE_NAZIR_ASSIGN], atCourse)]
      )
    ).toEqual({ kind: "appointer" });
  });

  it("holds every code of COURSE_CATALOG in the defaults of all three giver roles", () => {
    // So a giver holds each code at their own seat's level, and the level
    // stored on a row they give never needs a cap per code.
    const givers = Object.keys(GIVER_LEVEL) as AssignedRole[];
    expect(givers.sort()).toEqual(
      [R.KOSK_NAZIM, R.MEDRESE_BASMUDERRIS, R.MUDERRIS].sort()
    );
    for (const giver of givers) {
      const defaults = new Set<string>(ROLE_DEFAULT_PERMISSIONS[giver]);
      expect([giver, COURSE_CATALOG.filter((c) => !defaults.has(c))]).toEqual([
        giver,
        [],
      ]);
    }
    // and no other role gives: `permission.grant` is no role's default but theirs
    for (const other of Object.values(R)) {
      expect([
        other,
        ROLE_DEFAULT_PERMISSIONS[other].includes(P.PERMISSION_GRANT),
      ]).toEqual([other, other in GIVER_LEVEL]);
    }
  });
});
