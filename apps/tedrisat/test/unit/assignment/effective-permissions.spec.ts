import {
  PERMISSION_META,
  ROLE_DEFAULT_PERMISSIONS,
  roleCodesAt,
} from "@medaris/common";
import {
  buildEffectivePermissions,
  flattenPermissions,
  type IScopeHolding,
  listedAt,
} from "../../../src/assignment/effective-permissions";
import {
  isPermissionCode,
  PERMISSIONS,
} from "../../../src/assignment/permission-catalog";

const koskA = { type: "kosk" as const, id: "k1", name: "Nûruosmaniye Köşkü" };
const medrese = { type: "madrasah" as const, id: "m1", name: "Süleymaniye" };
const courseA = { type: "course" as const, id: "c1", name: "Emsile" };
const courseB = { type: "course" as const, id: "c2", name: "Bina" };
const courseC = { type: "course" as const, id: "c3", name: "Avâmil" };
const platform = { type: "platform" as const, id: null, name: null };
const everyCourse = { type: "course" as const, id: null, name: null };

/** A scope and what the engine gave there; the engine itself is not run here. */
const holding = (
  scope: Omit<IScopeHolding, "roles" | "codes">,
  roles: IScopeHolding["roles"],
  codes: readonly string[]
): IScopeHolding => ({ ...scope, roles, codes: new Set(codes) });

const content = (code: string) =>
  PERMISSION_META[code as keyof typeof PERMISSION_META].content;

describe("buildEffectivePermissions (MDRS-169, MDRS-135)", () => {
  it("lists what the engine gives a köşk nazımı at the köşk, its course work said by course.manage_all", () => {
    const groups = buildEffectivePermissions([
      holding(koskA, ["KOSK_NAZIM"], ROLE_DEFAULT_PERMISSIONS.KOSK_NAZIM),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ role: "KOSK_NAZIM", scopes: [koskA] });
    expect(groups[0].permissions).toEqual([
      ...roleCodesAt("KOSK_NAZIM", "kosk"),
    ]);
    expect(groups[0].permissions).toContain(PERMISSIONS.COURSE_MANAGE_ALL);
    expect(groups[0].permissions).not.toContain(PERMISSIONS.COURSE_PUBLISH);
    // The permission to give permissions is a rule, not a line.
    expect(groups[0].permissions).not.toContain(PERMISSIONS.PERMISSION_GRANT);
  });

  it("lists the başmüderris's course work under the medrese: they run its courses", () => {
    const [group] = buildEffectivePermissions([
      holding(
        medrese,
        ["MEDRESE_BASMUDERRIS"],
        ROLE_DEFAULT_PERMISSIONS.MEDRESE_BASMUDERRIS
      ),
    ]);
    expect(group.role).toBe("MEDRESE_BASMUDERRIS");
    for (const code of roleCodesAt("MEDRESE_BASMUDERRIS", "madrasah")) {
      expect(group.permissions, code).toContain(code);
    }
    for (const code of roleCodesAt("MUDERRIS", "course")) {
      expect(group.permissions, code).toContain(code);
    }
    expect(group.permissions).not.toContain(PERMISSIONS.PERMISSION_GRANT);
    expect(group.permissions).not.toContain(PERMISSIONS.MADRASAH_HIDE);
  });

  it("collapses the courses of one role with the same lines into one group, and keeps a passive one apart", () => {
    const all = ROLE_DEFAULT_PERMISSIONS.MUDERRIS;
    const groups = buildEffectivePermissions([
      holding(courseA, ["MUDERRIS"], all),
      holding(courseB, ["MUDERRIS"], all),
      holding(courseB, ["MUDERRIS"], all),
      // Its köşk went passive: the engine took the content away.
      holding(
        courseC,
        ["MUDERRIS"],
        all.filter((code) => !content(code))
      ),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].scopes.map((s) => s.id)).toEqual(["c1", "c2"]);
    expect(groups[0].permissions).toContain(PERMISSIONS.COURSE_EDIT);
    expect(groups[1].scopes.map((s) => s.id)).toEqual(["c3"]);
    expect(groups[1].permissions).not.toContain(PERMISSIONS.COURSE_EDIT);
    expect(groups[1].permissions).not.toContain(PERMISSIONS.SESSION_LIVE_LINK);
    expect(groups[1].permissions).toContain(PERMISSIONS.COURSE_SETTINGS);
  });

  it("draws a grant to 'every course' as a group of its own, apart from the platform's lines", () => {
    const codes = [PERMISSIONS.PLATFORM_AUDIT_READ, PERMISSIONS.COURSE_EDIT];
    const groups = buildEffectivePermissions([
      holding(platform, ["MEDARIS_NAZIM"], codes),
      holding(everyCourse, [], codes),
    ]);
    expect(groups).toEqual([
      {
        role: "MEDARIS_NAZIM",
        scopeType: "platform",
        scopes: [platform],
        permissions: [PERMISSIONS.PLATFORM_AUDIT_READ],
      },
      {
        role: null,
        scopeType: "course",
        scopes: [everyCourse],
        permissions: [PERMISSIONS.COURSE_EDIT],
      },
    ]);
  });

  it("draws a scope under its manager's role when more than one role is held there", () => {
    const groups = buildEffectivePermissions([
      holding(
        medrese,
        ["MEDRESE_NAZIR", "MEDRESE_BASMUDERRIS"],
        ROLE_DEFAULT_PERMISSIONS.MEDRESE_BASMUDERRIS
      ),
    ]);
    expect(groups.map((g) => g.role)).toEqual(["MEDRESE_BASMUDERRIS"]);
  });

  it("drops a scope where nothing listed is held: a role with no defaults, a grant no role covers", () => {
    expect(
      buildEffectivePermissions([
        holding(courseA, ["DERS_NAZIR"], [PERMISSIONS.COURSE_VIEW]),
        holding(koskA, [], []),
      ])
    ).toEqual([]);
  });

  it("flattens to distinct codes", () => {
    const flat = flattenPermissions(
      buildEffectivePermissions([
        holding(koskA, ["KOSK_NAZIM"], ROLE_DEFAULT_PERMISSIONS.KOSK_NAZIM),
        holding(courseA, ["MUDERRIS"], ROLE_DEFAULT_PERMISSIONS.MUDERRIS),
      ])
    );
    expect(new Set(flat).size).toBe(flat.length);
    expect(flat).toContain(PERMISSIONS.USER_LOOKUP);
  });
});

describe("listedAt: which held code is a line of which scope", () => {
  it("never lists a code at a scope its tag does not reach, whatever the row says", () => {
    expect(listedAt(PERMISSIONS.KOSK_MANAGE, "course", [])).toBe(false);
    expect(listedAt(PERMISSIONS.MADRASAH_BAN, "kosk", [])).toBe(false);
    expect(listedAt(PERMISSIONS.COURSE_EDIT, "platform", [])).toBe(false);
    expect(listedAt(PERMISSIONS.PLATFORM_AUDIT_READ, "course", [])).toBe(false);
  });

  it("lists course work held at a medrese, and at a köşk unless the köşk nazımı's course.manage_all says it", () => {
    expect(listedAt(PERMISSIONS.COURSE_EDIT, "madrasah", [])).toBe(true);
    expect(listedAt(PERMISSIONS.COURSE_EDIT, "kosk", [])).toBe(true);
    expect(listedAt(PERMISSIONS.COURSE_EDIT, "kosk", ["KOSK_NAZIM"])).toBe(
      false
    );
    // A code tagged for the köşk itself stays a line for its nazımı.
    expect(listedAt(PERMISSIONS.USER_LOOKUP, "kosk", ["KOSK_NAZIM"])).toBe(
      true
    );
  });
});

describe("permission catalog", () => {
  it("knows its own codes and nothing else", () => {
    expect(isPermissionCode("kosk.manage")).toBe(true);
    expect(isPermissionCode("kosk.nuke")).toBe(false);
  });

  it("holds every default code in the catalog", () => {
    for (const codes of Object.values(ROLE_DEFAULT_PERMISSIONS)) {
      for (const code of codes) expect(isPermissionCode(code)).toBe(true);
    }
  });
});
