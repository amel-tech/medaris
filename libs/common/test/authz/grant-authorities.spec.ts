import {
  ASSIGNED_ROLES,
  effectivePermissions,
  type IAuthzFacts,
  PERMISSIONS,
  RELATIONS,
  SCOPE_TYPES,
  type ScopeRef,
} from "../../src";

const MADRASAH = "33333333-3333-4333-8333-333333333333";
const COURSE = "55555555-5555-4555-8555-555555555555";

const platform: ScopeRef = { type: SCOPE_TYPES.PLATFORM, id: null };
const madrasah: ScopeRef = { type: SCOPE_TYPES.MADRASAH, id: MADRASAH };
const course: ScopeRef = { type: SCOPE_TYPES.COURSE, id: COURSE };

const facts: IAuthzFacts = {
  entity: "course",
  relation: RELATIONS.PUBLIC,
  chain: [course, madrasah, platform],
  madrasahCourse: true,
  passiveScope: null,
  policies: [],
};

/**
 * What a giver may hand a code on with (owner, d-1004-27 "tavan kazanır"):
 * the engine reports, per code, the authorities of the live grants that carry
 * it here, and nothing for a code held only by a role.
 */
describe("effective permissions: the authorities behind each granted code", () => {
  it("names the authority of every grant that counts, and nothing for a role default", () => {
    const result = effectivePermissions(
      facts,
      [
        { role: ASSIGNED_ROLES.MEDRESE_NAZIR, scope: madrasah },
        { role: ASSIGNED_ROLES.MUDERRIS, scope: course },
      ],
      [
        {
          scope: madrasah,
          codes: [PERMISSIONS.COURSE_SETTINGS],
          authority: SCOPE_TYPES.MADRASAH,
        },
        {
          scope: madrasah,
          codes: [PERMISSIONS.COURSE_SETTINGS],
          authority: SCOPE_TYPES.PLATFORM,
        },
        // A grant from before the authority column counts at its own level.
        {
          scope: course,
          codes: [PERMISSIONS.ENROLLMENT_DECIDE],
          authority: null,
        },
      ]
    );
    expect(result.grantAuthorities?.get(PERMISSIONS.COURSE_SETTINGS)).toEqual([
      SCOPE_TYPES.MADRASAH,
      SCOPE_TYPES.PLATFORM,
    ]);
    expect(result.grantAuthorities?.get(PERMISSIONS.ENROLLMENT_DECIDE)).toEqual(
      [SCOPE_TYPES.COURSE]
    );
    // The müderris holds course.edit by role default: no grant stands behind it.
    expect(result.codes.has(PERMISSIONS.COURSE_EDIT)).toBe(true);
    expect(result.grantAuthorities?.has(PERMISSIONS.COURSE_EDIT)).toBe(false);
  });

  it("says until when each grant is held: its own end, or the end of the role that lets it count, whichever is first (review B-grants-R2-2)", () => {
    const now = new Date("2026-10-04T12:00:00Z");
    const at = (hours: number) => new Date(now.getTime() + hours * 3600_000);
    const result = effectivePermissions(
      facts,
      [
        {
          role: ASSIGNED_ROLES.MEDRESE_NAZIR,
          scope: madrasah,
          expiresAt: at(5),
        },
      ],
      [
        {
          scope: madrasah,
          codes: [PERMISSIONS.COURSE_SETTINGS],
          authority: SCOPE_TYPES.MADRASAH,
        },
        {
          scope: madrasah,
          codes: [PERMISSIONS.COURSE_SETTINGS],
          authority: SCOPE_TYPES.PLATFORM,
          expiresAt: at(1),
        },
      ],
      now
    );
    expect(result.grantHoldings?.get(PERMISSIONS.COURSE_SETTINGS)).toEqual([
      { authority: SCOPE_TYPES.MADRASAH, until: at(5) },
      { authority: SCOPE_TYPES.PLATFORM, until: at(1) },
    ]);

    const forGood = effectivePermissions(
      facts,
      [
        {
          role: ASSIGNED_ROLES.MEDRESE_NAZIR,
          scope: madrasah,
          expiresAt: at(5),
        },
        { role: ASSIGNED_ROLES.MEDRESE_NAZIR, scope: madrasah },
      ],
      [
        {
          scope: madrasah,
          codes: [PERMISSIONS.COURSE_SETTINGS],
          authority: SCOPE_TYPES.PLATFORM,
        },
      ],
      now
    );
    expect(forGood.grantHoldings?.get(PERMISSIONS.COURSE_SETTINGS)).toEqual([
      { authority: SCOPE_TYPES.PLATFORM, until: null },
    ]);
  });

  it("leaves out a grant no held role covers", () => {
    const result = effectivePermissions(
      facts,
      [],
      [
        {
          scope: madrasah,
          codes: [PERMISSIONS.COURSE_SETTINGS],
          authority: SCOPE_TYPES.PLATFORM,
        },
      ]
    );
    expect(result.grantAuthorities?.size).toBe(0);
  });
});
