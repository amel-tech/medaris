import { ROLE_DEFAULT_PERMISSIONS, roleCodesAt } from "@medaris/common";
import {
  buildEffectivePermissions,
  flattenPermissions,
} from "../../../src/assignment/effective-permissions";
import {
  isPermissionCode,
  PERMISSIONS,
} from "../../../src/assignment/permission-catalog";

const koskA = { type: "kosk" as const, id: "k1", name: "Nûruosmaniye Köşkü" };
const courseA = { type: "course" as const, id: "c1", name: "Emsile" };
const courseB = { type: "course" as const, id: "c2", name: "Bina" };

describe("buildEffectivePermissions (MDRS-169)", () => {
  it("gives a role its defaults in the scope it is held in", () => {
    const groups = buildEffectivePermissions(
      [{ role: "KOSK_NAZIM", ...koskA }],
      []
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ role: "KOSK_NAZIM", scopes: [koskA] });
    // The defaults tagged for a köşk. The course work a köşk nazımı holds in the
    // köşk's courses arrives by nesting and is not repeated under the köşk, and
    // the permission to give permissions is a rule, not a line (MDRS-135).
    expect(groups[0].permissions).toEqual([
      ...roleCodesAt("KOSK_NAZIM", "kosk"),
    ]);
    expect(groups[0].permissions).toContain(PERMISSIONS.KOSK_MANAGE);
    expect(groups[0].permissions).not.toContain(PERMISSIONS.COURSE_PUBLISH);
    expect(groups[0].permissions).not.toContain(PERMISSIONS.PERMISSION_GRANT);
  });

  it("collapses the courses of one role into one group", () => {
    const groups = buildEffectivePermissions(
      [
        { role: "MUDERRIS", ...courseA },
        { role: "MUDERRIS", ...courseB },
        { role: "MUDERRIS", ...courseB },
      ],
      []
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].scopes.map((s) => s.id)).toEqual(["c1", "c2"]);
  });

  it("adds a grant to the group of the scope it is given in, once", () => {
    const groups = buildEffectivePermissions(
      [{ role: "MUDERRIS", ...courseA }],
      [
        {
          ...courseA,
          codes: [PERMISSIONS.COURSE_EDIT, PERMISSIONS.KOSK_MANAGE],
        },
      ]
    );
    const perms = groups[0].permissions;
    expect(perms.filter((p) => p === PERMISSIONS.COURSE_EDIT)).toHaveLength(1);
    expect(perms).toContain(PERMISSIONS.KOSK_MANAGE);
  });

  it("does not leak a grant from one scope into another", () => {
    const groups = buildEffectivePermissions(
      [{ role: "MUDERRIS", ...courseA }],
      [{ ...courseB, codes: [PERMISSIONS.COURSE_EDIT] }]
    );
    // The müderris of course A holds exactly what the role gives there, and
    // nothing from course B's grant (the assertion here once named
    // `kosk.manage`, which nothing in the test granted, so it could not fail:
    // review T6).
    const muderris = groups.find((g) => g.role === "MUDERRIS");
    expect(muderris?.permissions).toEqual([
      ...roleCodesAt("MUDERRIS", "course"),
    ]);
    expect(muderris?.scopes.map((s) => s.id)).toEqual(["c1"]);
    // And, as in the engine, it counts for nothing: no role held here covers
    // course B, and a permission never outlasts its role (MDRS-135).
    expect(groups.find((g) => g.scopes.some((s) => s.id === "c2"))).toBe(
      undefined
    );
  });

  describe("a grant counts under the role that covers it, as in the engine (MDRS-135)", () => {
    const medrese = {
      type: "madrasah" as const,
      id: "m1",
      name: "Süleymaniye",
    };
    const parents = (id: string) =>
      id === "c1" ? { koskId: "k1", madrasahId: "m1" } : null;

    it("keeps a grant on a course of the medrese whose nazır holds it, as its own group", () => {
      const groups = buildEffectivePermissions(
        [{ role: "MEDRESE_NAZIR", ...medrese }],
        [{ ...courseA, codes: [PERMISSIONS.COURSE_EDIT] }],
        parents
      );
      expect(groups).toEqual([
        expect.objectContaining({
          role: null,
          scopeType: "course",
          permissions: [PERMISSIONS.COURSE_EDIT],
        }),
      ]);
    });

    it("drops it for a nazır of another medrese, and for a role in no scope above", () => {
      const other = { type: "madrasah" as const, id: "m2", name: "Fatih" };
      expect(
        buildEffectivePermissions(
          [{ role: "MEDRESE_NAZIR", ...other }],
          [{ ...courseA, codes: [PERMISSIONS.COURSE_EDIT] }],
          parents
        )
      ).toEqual([]);
      expect(
        buildEffectivePermissions(
          [{ role: "MUDERRIS", ...courseB }],
          [{ ...koskA, codes: [PERMISSIONS.KOSK_MANAGE] }],
          parents
        ).find((g) => g.role === null)
      ).toBeUndefined();
    });

    it("never carries a code that cannot be handed on", () => {
      const groups = buildEffectivePermissions(
        [{ role: "DERS_NAZIR", ...courseA }],
        [
          {
            ...courseA,
            codes: [PERMISSIONS.PERMISSION_GRANT, PERMISSIONS.COURSE_EDIT],
          },
        ]
      );
      expect(groups[0].permissions).toEqual([PERMISSIONS.COURSE_EDIT]);
    });
  });

  it("drops a role with no defaults and no grants", () => {
    expect(
      buildEffectivePermissions([{ role: "DERS_NAZIR", ...courseA }], [])
    ).toEqual([]);
  });

  it("flattens to distinct codes", () => {
    const groups = buildEffectivePermissions(
      [
        { role: "KOSK_NAZIM", ...koskA },
        { role: "MUDERRIS", ...courseA },
      ],
      []
    );
    const flat = flattenPermissions(groups);
    expect(new Set(flat).size).toBe(flat.length);
    expect(flat).toContain(PERMISSIONS.USER_LOOKUP);
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
