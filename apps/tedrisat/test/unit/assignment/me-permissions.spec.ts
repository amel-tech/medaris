import {
  ASSIGNED_ROLES,
  type IHeldGrantCodes,
  type IHeldRole,
  PERMISSIONS,
  type PermissionCode,
  SCOPE_TYPES,
  type ScopeRef,
} from "@medaris/common";
import {
  type IMeScopeInfo,
  permissionsPerScope,
} from "../../../src/assignment/me-permissions";

const K = "11111111-1111-4111-8111-111111111111";
const M = "33333333-3333-4333-8333-333333333333";
const OTHER_M = "44444444-4444-4444-8444-444444444444";
const C = "55555555-5555-4555-8555-555555555555";
const OTHER_C = "66666666-6666-4666-8666-666666666666";
const GONE = "77777777-7777-4777-8777-777777777777";

const platform: ScopeRef = { type: SCOPE_TYPES.PLATFORM, id: null };
const kosk = (id = K): ScopeRef => ({ type: SCOPE_TYPES.KOSK, id });
const madrasah = (id = M): ScopeRef => ({ type: SCOPE_TYPES.MADRASAH, id });
const course = (id = C): ScopeRef => ({ type: SCOPE_TYPES.COURSE, id });

const role = (r: IHeldRole["role"], scope: ScopeRef, expiresAt?: Date) =>
  ({ role: r, scope, expiresAt }) as IHeldRole;
const grant = (
  scope: ScopeRef,
  codes: PermissionCode[],
  expiresAt?: Date
): IHeldGrantCodes => ({ scope, codes, authority: null, expiresAt });

const P = PERMISSIONS;

/** A köşk, a medrese in it, a medrese course and a köşk-owned course; GONE is deleted. */
const known: Record<string, IMeScopeInfo> = {
  [K]: { name: "Süleymaniye Köşkü" },
  [M]: { name: "Süleymaniye Medresesi" },
  [OTHER_M]: { name: "Fâtih Medresesi" },
  [C]: { name: "Bina", koskId: K, madrasahId: M },
  [OTHER_C]: { name: "Kâfiye", koskId: K, madrasahId: null },
};
const lookup = (scope: ScopeRef) =>
  scope.id ? (known[scope.id] ?? null) : null;

const entry = (
  result: ReturnType<typeof permissionsPerScope>,
  type: string,
  id: string | null
) => result.find((e) => e.scopeType === type && e.scopeId === id);

describe("permissionsPerScope (MDRS-142)", () => {
  it("gives a başmüderris one entry for the medrese: its role and the medrese-scoped permissions", () => {
    const result = permissionsPerScope(
      [role(ASSIGNED_ROLES.MEDRESE_BASMUDERRIS, madrasah())],
      [],
      lookup
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      scopeType: "madrasah",
      scopeId: M,
      scopeName: "Süleymaniye Medresesi",
      roles: [ASSIGNED_ROLES.MEDRESE_BASMUDERRIS],
    });
    expect(result[0].permissions).toContain(P.MADRASAH_COURSE_OPEN);
    expect(result[0].permissions).toContain(P.USER_LOOKUP);
    expect(result[0].permissions).not.toContain(P.KOSK_MANAGE);
  });

  it("gives a ders nazırı with one group grant exactly the group's codes, and keeps an empty entry for one with none", () => {
    const group = [P.COURSE_EDIT, P.SESSION_MANAGE];
    expect(
      permissionsPerScope(
        [role(ASSIGNED_ROLES.DERS_NAZIR, course())],
        [grant(course(), group)],
        lookup
      )[0].permissions
    ).toEqual([...group].sort());
    const none = permissionsPerScope(
      [role(ASSIGNED_ROLES.DERS_NAZIR, course())],
      [],
      lookup
    );
    expect(none).toEqual([
      expect.objectContaining({
        scopeType: "course",
        scopeId: C,
        roles: [ASSIGNED_ROLES.DERS_NAZIR],
        permissions: [],
      }),
    ]);
  });

  it("lists the course work a köşk nazımı holds across the köşk's courses under the köşk", () => {
    const result = permissionsPerScope(
      [role(ASSIGNED_ROLES.KOSK_NAZIM, kosk())],
      [],
      lookup
    );
    expect(result[0].permissions).toEqual(
      expect.arrayContaining([P.KOSK_MANAGE, P.COURSE_EDIT, P.USER_LOOKUP])
    );
  });

  it("keeps unlisted codes (a button needs them) and leaves implicit ones out", () => {
    const [kosk0] = permissionsPerScope(
      [role(ASSIGNED_ROLES.KOSK_NAZIM, kosk())],
      [],
      lookup
    );
    expect(kosk0.permissions).toContain(P.COURSE_HIDE);
    expect(kosk0.permissions).not.toContain(P.COURSE_VIEW);
    expect(kosk0.permissions).not.toContain(P.COURSE_ENROLL);
  });

  it("drops a grant that no role covers, an expired grant and a role that has run out", () => {
    const now = new Date("2026-10-10T10:00:00Z");
    const past = new Date("2026-10-10T09:00:00Z");
    expect(
      permissionsPerScope(
        [],
        [grant(madrasah(), [P.MADRASAH_BAN])],
        lookup,
        now
      )
    ).toEqual([]);
    expect(
      permissionsPerScope(
        [role(ASSIGNED_ROLES.MEDRESE_NAZIR, madrasah())],
        [grant(madrasah(), [P.MADRASAH_BAN], past)],
        lookup,
        now
      )[0].permissions
    ).toEqual([]);
    expect(
      permissionsPerScope(
        [role(ASSIGNED_ROLES.MEDRESE_NAZIR, madrasah(), past)],
        [grant(madrasah(), [P.MADRASAH_BAN])],
        lookup,
        now
      )
    ).toEqual([]);
  });

  it("counts a grant 'for every course' in a course where a role is held, and in no other scope's entry", () => {
    const everyCourse = grant({ type: SCOPE_TYPES.COURSE, id: null }, [
      P.COURSE_EDIT,
    ]);
    const result = permissionsPerScope(
      [
        role(ASSIGNED_ROLES.DERS_NAZIR, course()),
        role(ASSIGNED_ROLES.MEDRESE_NAZIR, madrasah()),
      ],
      [everyCourse],
      lookup
    );
    expect(entry(result, "course", C)?.permissions).toEqual([P.COURSE_EDIT]);
    expect(entry(result, "madrasah", M)?.permissions).toEqual([]);
    expect(result).toHaveLength(2);
  });

  it("gives a medrese nazırı an entry for a course their grant is in, with no role of its own there", () => {
    const result = permissionsPerScope(
      [role(ASSIGNED_ROLES.MEDRESE_NAZIR, madrasah())],
      [
        grant(course(), [P.USER_LOOKUP]),
        grant(course(OTHER_C), [P.USER_LOOKUP]),
      ],
      lookup
    );
    expect(entry(result, "course", C)).toMatchObject({
      roles: [],
      permissions: [P.USER_LOOKUP],
    });
    // OTHER_C sits in no medrese: the nazır's role does not cover it.
    expect(entry(result, "course", OTHER_C)).toBeUndefined();
    expect(entry(result, "madrasah", M)?.permissions).toEqual([]);
  });

  it("gives a Medaris nazımı a platform entry with what was granted, and nothing without a grant", () => {
    const medaris = role(ASSIGNED_ROLES.MEDARIS_NAZIM, platform);
    expect(permissionsPerScope([medaris], [], lookup)).toEqual([
      {
        scopeType: "platform",
        scopeId: null,
        scopeName: null,
        roles: [ASSIGNED_ROLES.MEDARIS_NAZIM],
        permissions: [],
      },
    ]);
    expect(
      permissionsPerScope(
        [medaris],
        [grant(platform, [P.PLATFORM_KOSK_CREATE, P.PLATFORM_AUDIT_READ])],
        lookup
      )[0].permissions
    ).toEqual([P.PLATFORM_AUDIT_READ, P.PLATFORM_KOSK_CREATE].sort());
  });

  it("leaves out a role whose scope no longer exists", () => {
    expect(
      permissionsPerScope(
        [role(ASSIGNED_ROLES.KOSK_NAZIM, kosk(GONE))],
        [],
        lookup
      )
    ).toEqual([]);
  });

  it("names the roles held in one scope once each, and orders entries platform, köşk, medrese, course, then by name", () => {
    const result = permissionsPerScope(
      [
        role(ASSIGNED_ROLES.MUDERRIS, course(OTHER_C)),
        role(ASSIGNED_ROLES.MUDERRIS, course()),
        role(ASSIGNED_ROLES.MEDRESE_BASMUDERRIS, madrasah()),
        role(ASSIGNED_ROLES.MEDRESE_NAZIR, madrasah()),
        role(ASSIGNED_ROLES.KOSK_NAZIM, kosk()),
        role(ASSIGNED_ROLES.MEDARIS_NAZIM, platform),
      ],
      [],
      lookup
    );
    expect(result.map((e) => [e.scopeType, e.scopeName])).toEqual([
      ["platform", null],
      ["kosk", "Süleymaniye Köşkü"],
      ["madrasah", "Süleymaniye Medresesi"],
      ["course", "Bina"],
      ["course", "Kâfiye"],
    ]);
    expect(entry(result, "madrasah", M)?.roles).toEqual(
      [ASSIGNED_ROLES.MEDRESE_BASMUDERRIS, ASSIGNED_ROLES.MEDRESE_NAZIR].sort()
    );
  });
});
