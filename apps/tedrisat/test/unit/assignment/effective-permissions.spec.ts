import {
  buildEffectivePermissions,
  flattenPermissions,
} from "../../../src/assignment/effective-permissions";
import {
  isPermissionCode,
  PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
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
    expect(groups[0].permissions).toEqual([
      ...ROLE_DEFAULT_PERMISSIONS.KOSK_NAZIM,
    ]);
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
      [{ ...courseB, codes: [PERMISSIONS.KOSK_MANAGE] }]
    );
    expect(
      groups.find((g) => g.role === "MUDERRIS")?.permissions
    ).not.toContain(PERMISSIONS.KOSK_MANAGE);
    expect(groups.find((g) => g.role === null)?.scopes).toEqual([courseB]);
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
