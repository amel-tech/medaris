import {
  type AuthzService,
  PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
  SelfGrantGuard,
} from "@medaris/common";
import { describe, expect, it, vi } from "vitest";
import {
  PermissionGroupEmptyError,
  PermissionGroupNameTakenError,
  PermissionGroupNotFoundError,
  UnknownPermissionError,
  UsersPolicyRequiredError,
} from "../../../src/assignment/admin/errors";
import type { PermissionAdminRepository } from "../../../src/assignment/admin/permission-admin.repository";
import { GrantExceedsGiverError } from "../../../src/kosk/errors/kosk-grants-errors";
import { NazirCourseScopeError } from "../../../src/madrasah/errors/nazir-course-scope.error";
import { NazirNotFoundError } from "../../../src/madrasah/errors/nazir-not-found.error";
import { PermissionNotGivableError } from "../../../src/madrasah/errors/permission-not-givable.error";
import type { MadrasahNazirRepository } from "../../../src/madrasah/nazir/madrasah-nazir.repository";
import type { MadrasahNazirService } from "../../../src/madrasah/nazir/madrasah-nazir.service";
import {
  MadrasahPermissionService,
  madrasahGroupScopeOf,
} from "../../../src/madrasah/nazir/madrasah-permission.service";

/**
 * MDRS-185, nazir/06 and nazir/16: the rules of giving permissions and of the
 * medrese's groups, with the repositories faked. The routes end to end, with
 * a real database, are test/e2e/madrasah-permission.e2e.spec.ts.
 */
const M = "c6000000-0000-4000-8000-0000000000aa";
const OTHER_M = "c6000000-0000-4000-8000-0000000000ab";
const NAZIR = "c6000000-0000-4000-8000-0000000000b1";
const C1 = "c6000000-0000-4000-8000-0000000000c1";
const G = "c6000000-0000-4000-8000-0000000000e1";

const ADMIN = { sub: "a1", realm_access: { roles: ["SYSTEM_ADMIN"] } };
const HEAD = { sub: "a2" };
const STRANGER = { sub: "a3" };
/** A Medaris nazımı holding `platform.madrasah_nazir_grant`: no default of their own. */
const MEDARIS = { sub: "a4" };

const group = (over: Record<string, unknown> = {}) => ({
  id: G,
  name: "Kayıt ve talebe işleri",
  scopeType: "madrasah",
  scopeId: M,
  permissions: ["course.edit", "session.manage"],
  userCount: 0,
  ...over,
});

function build(
  parts: {
    repo?: Record<string, unknown>;
    groups?: Record<string, unknown>;
    nazirs?: Record<string, unknown>;
    /** What the engine says a caller holds: in the medrese (and every course), and in single courses. */
    held?: Record<
      string,
      {
        medrese: string[];
        courses?: Record<string, string[]>;
        /**
         * In the medrese: the grants behind each code, by authority, held with
         * no end unless an end is given.
         */
        authorities?: Record<
          string,
          Array<string | { authority: string; until: Date | null }>
        >;
      }
    >;
  } = {}
) {
  const repo = {
    heldRoles: vi.fn().mockResolvedValue([{ userId: NAZIR }]),
    courseIdsOf: vi.fn().mockImplementation((_m, ids: string[]) => ids),
    setPermissions: vi.fn().mockResolvedValue(undefined),
    heldTreeGrants: vi.fn().mockResolvedValue([]),
    ...parts.repo,
  };
  const groups = {
    findGroup: vi.fn().mockResolvedValue(group()),
    nameTaken: vi.fn().mockResolvedValue(false),
    createGroup: vi.fn().mockResolvedValue(G),
    updateGroup: vi.fn().mockResolvedValue(undefined),
    deleteGroup: vi.fn().mockResolvedValue(undefined),
    listGroups: vi.fn().mockResolvedValue([group()]),
    ...parts.groups,
  };
  const nazirs = {
    find: vi.fn().mockResolvedValue({ user: { id: NAZIR } }),
    ...parts.nazirs,
  };
  // The engine: a başmüderris (a2) holds `permission.grant` in their medrese by
  // role default and every medrese and course code with it; the Medaris nazımı
  // (a4) holds the platform's `madrasah_nazir_grant` and, in `held`, whatever
  // the başnazım gave them.
  const heads = new Set<string>(ROLE_DEFAULT_PERMISSIONS.MEDRESE_BASMUDERRIS);
  const held = parts.held ?? {};
  const authz = {
    effective: vi
      .fn()
      .mockImplementation(
        async (
          u: { sub: string },
          resource: { entity: string; id: string },
          options?: { acrossCourses?: boolean }
        ) => {
          if (u.sub === "a2") return { codes: heads };
          const mine = held[u.sub];
          if (resource.entity === "course") {
            return { codes: new Set(mine?.courses?.[resource.id] ?? []) };
          }
          return {
            codes: new Set(options?.acrossCourses ? (mine?.medrese ?? []) : []),
            grantHoldings: new Map(
              Object.entries(mine?.authorities ?? {}).map(([code, list]) => [
                code,
                list.map((held) =>
                  typeof held === "string"
                    ? { authority: held, until: null }
                    : held
                ),
              ])
            ),
          };
        }
      ),
    isSystemAdmin: (u: { realm_access?: { roles?: string[] } }) =>
      u.realm_access?.roles?.includes("SYSTEM_ADMIN") ?? false,
    can: vi
      .fn()
      .mockImplementation(
        async (u: { sub: string }, _resource: unknown, code: string) =>
          (u.sub === "a2" && code === PERMISSIONS.PERMISSION_GRANT) ||
          (u.sub === "a4" && code === PERMISSIONS.PLATFORM_MADRASAH_NAZIR_GRANT)
      ),
  };
  const service = new MadrasahPermissionService(
    repo as unknown as MadrasahNazirRepository,
    nazirs as unknown as MadrasahNazirService,
    groups as unknown as PermissionAdminRepository,
    authz as unknown as AuthzService,
    // The real guard over the same engine stub: it asks `isSystemAdmin` and,
    // for a path that is not `always`, `effective`, which nothing here uses.
    new SelfGrantGuard(authz as unknown as AuthzService)
  );
  return { service, repo, groups, nazirs };
}

describe("madrasahGroupScopeOf", () => {
  it("is MADRASAH when any permission is the medrese's, COURSE when all are course ones", () => {
    expect(madrasahGroupScopeOf(["course.edit", "madrasah.ban"])).toBe(
      "MADRASAH"
    );
    expect(madrasahGroupScopeOf(["course.edit"])).toBe("COURSE");
  });
});

describe("the dictionary", () => {
  it("lets the başmüderris and the başnazım give everything and a stranger nothing", async () => {
    const { service } = build();
    const head = await service.catalog(HEAD, M);
    // The ten medrese and twenty course permissions of nazir/06, the owner's
    // one more of each (1 October) and `question.answer` (MDRS-150).
    expect(head.madrasah).toHaveLength(11);
    expect(head.course).toHaveLength(22);
    expect(head.givable).toHaveLength(33);
    expect((await service.catalog(ADMIN, M)).givable).toHaveLength(33);
    expect((await service.catalog(STRANGER, M)).givable).toEqual([]);
  });
});

describe("defining a group", () => {
  const create = (over: Record<string, unknown> = {}) => ({
    name: "  Yasak ve itiraz ",
    scope: "MADRASAH" as const,
    permissions: ["madrasah.ban", "ban.course", "ban.course"],
    ...over,
  });

  it("stores it in the medrese with the name trimmed and the codes once", async () => {
    const { service, groups } = build();
    await service.createGroup(HEAD, M, create());
    expect(groups.createGroup).toHaveBeenCalledWith("a2", {
      name: "Yasak ve itiraz",
      scopeType: "madrasah",
      scopeId: M,
      permissions: ["madrasah.ban", "ban.course"],
      authority: "madrasah",
    });
    expect(groups.nameTaken).toHaveBeenCalledWith("Yasak ve itiraz", M);
  });

  it("is the başmüderris's and the başnazım's alone", async () => {
    const { service, groups } = build();
    await expect(
      service.createGroup(STRANGER, M, create())
    ).rejects.toBeInstanceOf(PermissionNotGivableError);
    await expect(
      service.createGroup(ADMIN, M, create())
    ).resolves.toBeDefined();
    expect(groups.createGroup).toHaveBeenCalledTimes(1);
  });

  it("refuses a medrese permission in a course group, an unknown code and an empty group", async () => {
    const { service } = build();
    await expect(
      service.createGroup(HEAD, M, create({ scope: "COURSE" }))
    ).rejects.toBeInstanceOf(UnknownPermissionError);
    await expect(
      service.createGroup(HEAD, M, create({ permissions: ["kosk.nuke"] }))
    ).rejects.toBeInstanceOf(UnknownPermissionError);
    await expect(
      service.createGroup(HEAD, M, create({ permissions: [] }))
    ).rejects.toBeInstanceOf(PermissionGroupEmptyError);
  });

  it("refuses a name another live group of the medrese has", async () => {
    const { service } = build({
      groups: { nameTaken: vi.fn().mockResolvedValue(true) },
    });
    await expect(service.createGroup(HEAD, M, create())).rejects.toBeInstanceOf(
      PermissionGroupNameTakenError
    );
  });
});

describe("changing and deleting a group", () => {
  it("asks what becomes of the people who hold it before changing its permissions", async () => {
    const { service, groups } = build({
      groups: {
        findGroup: vi.fn().mockResolvedValue(group({ userCount: 2 })),
      },
    });
    await expect(
      service.updateGroup(HEAD, M, G, { permissions: ["course.edit"] })
    ).rejects.toBeInstanceOf(UsersPolicyRequiredError);
    await service.updateGroup(HEAD, M, G, {
      permissions: ["course.edit"],
      usersPolicy: "keep",
    });
    expect(groups.updateGroup).toHaveBeenCalledWith("a2", G, {
      name: "Kayıt ve talebe işleri",
      permissions: ["course.edit"],
      usersPolicy: "keep",
      authority: "madrasah",
    });
  });

  it("renames a group in use without asking, since its permissions stay", async () => {
    const { service, groups } = build({
      groups: {
        findGroup: vi.fn().mockResolvedValue(group({ userCount: 2 })),
      },
    });
    await service.updateGroup(HEAD, M, G, { name: "Kadro" });
    expect(groups.updateGroup).toHaveBeenCalledWith("a2", G, {
      name: "Kadro",
      permissions: ["course.edit", "session.manage"],
      usersPolicy: null,
      authority: "madrasah",
    });
  });

  it("asks before deleting a group in use and not otherwise", async () => {
    const used = build({
      groups: {
        findGroup: vi.fn().mockResolvedValue(group({ userCount: 1 })),
      },
    });
    await expect(
      used.service.deleteGroup(HEAD, M, G, undefined)
    ).rejects.toBeInstanceOf(UsersPolicyRequiredError);
    await used.service.deleteGroup(HEAD, M, G, "revoke");
    expect(used.groups.deleteGroup).toHaveBeenCalledWith(
      "a2",
      G,
      "revoke",
      "madrasah"
    );

    const free = build();
    await free.service.deleteGroup(HEAD, M, G, undefined);
    expect(free.groups.deleteGroup).toHaveBeenCalledWith(
      "a2",
      G,
      null,
      "madrasah"
    );
  });

  it("does not know another medrese's group, the platform's, or a missing one", async () => {
    for (const found of [
      group({ scopeId: OTHER_M }),
      group({ scopeType: "platform", scopeId: null }),
      null,
    ]) {
      const { service } = build({
        groups: { findGroup: vi.fn().mockResolvedValue(found) },
      });
      await expect(
        service.updateGroup(HEAD, M, G, { name: "x" })
      ).rejects.toBeInstanceOf(PermissionGroupNotFoundError);
      await expect(
        service.deleteGroup(HEAD, M, G, "keep")
      ).rejects.toBeInstanceOf(PermissionGroupNotFoundError);
    }
  });
});

describe("giving a nazır their permissions", () => {
  const body = (over: Record<string, unknown> = {}) => ({
    permissions: [] as string[],
    ...over,
  });

  it("writes the scopes the choices come to, without repeating the group's codes", async () => {
    const { service, repo } = build();
    await service.setNazirPermissions(
      HEAD,
      M,
      NAZIR.toUpperCase(),
      body({
        groupId: G,
        permissions: ["course.edit", "madrasah.ban"],
        courseIds: [C1],
        expiresAt: "2099-01-01T00:00:00.000Z",
      })
    );
    expect(repo.heldRoles).toHaveBeenCalledWith(M, NAZIR);
    expect(repo.setPermissions).toHaveBeenCalledWith(M, NAZIR, "a2", {
      // A başmüderris gives from the `permission.grant` their role holds, as the
      // medrese's authority (MDRS-135): below the platform, above a course.
      authority: "madrasah",
      scopes: [
        {
          scopeType: "madrasah",
          scopeId: M,
          groupId: null,
          permissions: ["madrasah.ban"],
        },
        { scopeType: "course", scopeId: C1, groupId: G, permissions: [] },
      ],
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      // The başmüderris is asked, and holds all of it; what they give is
      // stored no higher than their own holding (d-1004-27).
      ceiling: expect.any(Function),
      authorityFor: expect.any(Function),
    });
  });

  it("is the başmüderris's and the başnazım's alone", async () => {
    const { service, repo } = build();
    await expect(
      service.setNazirPermissions(STRANGER, M, NAZIR, body())
    ).rejects.toBeInstanceOf(PermissionNotGivableError);
    expect(repo.setPermissions).not.toHaveBeenCalled();
  });

  it("answers a user who is no nazır of the medrese with not-found", async () => {
    const { service } = build({
      repo: { heldRoles: vi.fn().mockResolvedValue([]) },
    });
    await expect(
      service.setNazirPermissions(HEAD, M, NAZIR, body())
    ).rejects.toBeInstanceOf(NazirNotFoundError);
    await expect(service.getNazirPermissions(M, NAZIR)).rejects.toBeInstanceOf(
      NazirNotFoundError
    );
  });

  it("refuses an unknown code and a group that is not the medrese's", async () => {
    const { service } = build();
    await expect(
      service.setNazirPermissions(
        HEAD,
        M,
        NAZIR,
        body({ permissions: ["platform.audit_read"] })
      )
    ).rejects.toBeInstanceOf(UnknownPermissionError);

    const foreign = build({
      groups: {
        findGroup: vi.fn().mockResolvedValue(group({ scopeId: OTHER_M })),
      },
    });
    await expect(
      foreign.service.setNazirPermissions(HEAD, M, NAZIR, body({ groupId: G }))
    ).rejects.toBeInstanceOf(PermissionGroupNotFoundError);
  });

  it.each([
    ["no course chosen", body({ courseIds: [], permissions: ["course.edit"] })],
    [
      "nothing course-level to limit",
      body({ courseIds: [C1], permissions: ["madrasah.ban"] }),
    ],
    [
      "a group that carries a medrese permission",
      body({ courseIds: [C1], groupId: G }),
    ],
  ])("refuses courses with %s", async (_what, dto) => {
    const { service, repo } = build({
      groups: {
        findGroup: vi
          .fn()
          .mockResolvedValue(
            group({ permissions: ["madrasah.ban", "course.edit"] })
          ),
      },
    });
    await expect(
      service.setNazirPermissions(HEAD, M, NAZIR, dto)
    ).rejects.toBeInstanceOf(NazirCourseScopeError);
    expect(repo.setPermissions).not.toHaveBeenCalled();
  });

  it("refuses a course that is not the medrese's", async () => {
    const { service } = build({
      repo: { courseIdsOf: vi.fn().mockResolvedValue([]) },
    });
    await expect(
      service.setNazirPermissions(
        HEAD,
        M,
        NAZIR,
        body({ courseIds: [C1], permissions: ["course.edit"] })
      )
    ).rejects.toBeInstanceOf(NazirCourseScopeError);
  });

  it("reads back the state it writes", async () => {
    const { service } = build({
      repo: {
        heldTreeGrants: vi.fn().mockResolvedValue([
          {
            scopeType: "madrasah",
            scopeId: M,
            permission: "madrasah.ban",
            groupId: null,
            expiresAt: null,
          },
        ]),
      },
    });
    await expect(service.getNazirPermissions(M, NAZIR)).resolves.toEqual({
      groupId: null,
      permissions: ["madrasah.ban"],
      courseIds: null,
      expiresAt: null,
    });
  });
});

describe('the ceiling of a Medaris nazımı (MDRS-209: "kendi izinleriyle sınırlı elbette")', () => {
  const medarisGroup = (permissions: string[]) => ({
    name: "Kadro",
    scope: "MADRASAH" as const,
    permissions,
  });

  it("gives a group only of what they hold, and names what exceeds it", async () => {
    const { service, groups } = build({
      held: { a4: { medrese: ["madrasah.students_view"] } },
    });
    await service.createGroup(
      MEDARIS,
      M,
      medarisGroup(["madrasah.students_view"])
    );
    expect(groups.createGroup).toHaveBeenCalledWith(
      "a4",
      expect.objectContaining({ authority: "platform" })
    );
    const refused = service.createGroup(
      MEDARIS,
      M,
      medarisGroup(["madrasah.students_view", "madrasah.ban", "course.edit"])
    );
    await expect(refused).rejects.toBeInstanceOf(GrantExceedsGiverError);
    await expect(refused).rejects.toMatchObject({
      message: "You do not hold: course.edit, madrasah.ban",
    });
    expect(groups.createGroup).toHaveBeenCalledTimes(1);
  });

  it("with nothing of their own, gives no group and no permission", async () => {
    const { service, groups, repo } = build();
    await expect(
      service.createGroup(MEDARIS, M, medarisGroup(["madrasah.ban"]))
    ).rejects.toBeInstanceOf(GrantExceedsGiverError);
    expect(groups.createGroup).not.toHaveBeenCalled();
    // The write asks the ceiling of what it really inserts, and refuses.
    repo.setPermissions.mockImplementation(
      async (
        _m: string,
        _n: string,
        _a: string,
        wanted: { ceiling?: (g: unknown[]) => void }
      ) =>
        wanted.ceiling?.([
          {
            scopeType: "madrasah",
            scopeId: M,
            permission: "madrasah.ban",
            groupId: null,
            codes: ["madrasah.ban"],
          },
        ])
    );
    await expect(
      service.setNazirPermissions(MEDARIS, M, NAZIR, {
        permissions: ["madrasah.ban"],
      } as never)
    ).rejects.toMatchObject({ code: "GRANT_EXCEEDS_GIVER" });
  });

  it("a change to a group adds only held codes; a rename and a removal are not gifts", async () => {
    const { service, groups } = build({
      held: { a4: { medrese: ["course.edit"] } },
    });
    // The group has course.edit and session.manage; they hold course.edit.
    await service.updateGroup(MEDARIS, M, G, { name: "Yeni ad" });
    await service.updateGroup(MEDARIS, M, G, { permissions: ["course.edit"] });
    expect(groups.updateGroup).toHaveBeenCalledTimes(2);
    await expect(
      service.updateGroup(MEDARIS, M, G, {
        permissions: ["course.edit", "madrasah.ban"],
      })
    ).rejects.toMatchObject({
      message: "You do not hold: madrasah.ban",
    });
  });

  it("a course the grant is limited to can carry what they hold in that course alone", async () => {
    const { service, repo } = build({
      held: { a4: { medrese: [], courses: { [C1]: ["course.edit"] } } },
    });
    let asked: unknown;
    repo.setPermissions.mockImplementation(
      async (
        _m: string,
        _n: string,
        _a: string,
        wanted: { ceiling?: (g: unknown[]) => void }
      ) => {
        asked = wanted.ceiling;
      }
    );
    await service.setNazirPermissions(MEDARIS, M, NAZIR, {
      permissions: ["course.edit"],
      courseIds: [C1],
    } as never);
    const ceiling = asked as (g: unknown[]) => void;
    expect(() =>
      ceiling([
        {
          scopeType: "course",
          scopeId: C1,
          permission: "course.edit",
          groupId: null,
          codes: ["course.edit"],
        },
      ])
    ).not.toThrow();
    expect(() =>
      ceiling([
        {
          scopeType: "madrasah",
          scopeId: M,
          permission: "course.edit",
          groupId: null,
          codes: ["course.edit"],
        },
      ])
    ).toThrow(GrantExceedsGiverError);
  });

  it("stores a gift no higher than the giver's own holding of its codes (d-1004-27)", async () => {
    const { service, repo } = build({
      held: {
        a4: {
          medrese: ["course.edit", "course.settings", "madrasah.ban"],
          // course.settings from the başmüderris, course.edit from the
          // başnazım, madrasah.ban by no grant at all.
          authorities: {
            "course.settings": ["madrasah"],
            "course.edit": ["platform"],
          },
        },
      },
    });
    let authorityFor:
      | ((row: unknown, expiresAt: Date | null) => string)
      | undefined;
    repo.setPermissions.mockImplementation(
      async (
        _m: string,
        _n: string,
        _a: string,
        wanted: {
          authorityFor?: (row: unknown, expiresAt: Date | null) => string;
        }
      ) => {
        authorityFor = wanted.authorityFor;
      }
    );
    await service.setNazirPermissions(MEDARIS, M, NAZIR, {
      permissions: ["course.edit"],
    } as never);
    const row = (codes: string[]) => ({
      scopeType: "madrasah",
      scopeId: M,
      permission: null,
      groupId: null,
      codes,
    });
    expect(authorityFor?.(row(["course.edit"]), null)).toBe("platform");
    expect(authorityFor?.(row(["course.settings"]), null)).toBe("madrasah");
    expect(authorityFor?.(row(["madrasah.ban"]), null)).toBe("madrasah");
    // A group row is capped by the weakest of its codes.
    expect(authorityFor?.(row(["course.edit", "course.settings"]), null)).toBe(
      "madrasah"
    );
  });

  it("stores the platform's authority only on a row that ends while the giver still holds it (review B-grants-R2-2)", async () => {
    const inHours = (n: number) => new Date(Date.now() + n * 3600_000);
    const { service, repo } = build({
      held: {
        a4: {
          medrese: ["course.edit"],
          // course.edit from the başmüderris for good, and from the başnazım
          // with the platform's authority for one hour.
          authorities: {
            "course.edit": [
              "madrasah",
              { authority: "platform", until: inHours(1) },
            ],
          },
        },
      },
    });
    let authorityFor:
      | ((row: unknown, expiresAt: Date | null) => string)
      | undefined;
    repo.setPermissions.mockImplementation(
      async (
        _m: string,
        _n: string,
        _a: string,
        wanted: {
          authorityFor?: (row: unknown, expiresAt: Date | null) => string;
        }
      ) => {
        authorityFor = wanted.authorityFor;
      }
    );
    await service.setNazirPermissions(MEDARIS, M, NAZIR, {
      permissions: ["course.edit"],
    } as never);
    const row = {
      scopeType: "madrasah",
      scopeId: M,
      permission: "course.edit",
      groupId: null,
      codes: ["course.edit"],
    };
    expect(authorityFor?.(row, null)).toBe("madrasah");
    expect(authorityFor?.(row, inHours(2))).toBe("madrasah");
    expect(authorityFor?.(row, inHours(0.5))).toBe("platform");
  });

  it("lists as givable only what they hold, so the screens refuse what the write refuses", async () => {
    const { service } = build({
      held: { a4: { medrese: ["madrasah.students_view", "course.edit"] } },
    });
    const catalog = await service.catalog(MEDARIS, M);
    expect(catalog.givable.sort()).toEqual([
      "course.edit",
      "madrasah.students_view",
    ]);
    // The lists themselves are the same for everyone; only the ticking differs.
    expect(catalog.madrasah).toHaveLength(11);
    const empty = await build().service.catalog(MEDARIS, M);
    expect(empty.givable).toEqual([]);
    expect(empty.course).toHaveLength(22);
  });

  it("the başnazım is not asked, and the başmüderris holds every code so is asked nothing", async () => {
    const { service, groups } = build();
    await service.createGroup(
      ADMIN,
      M,
      medarisGroup(["madrasah.ban", "course.edit"])
    );
    await service.createGroup(
      HEAD,
      M,
      medarisGroup(["madrasah.ban", "course.edit"])
    );
    expect(groups.createGroup).toHaveBeenCalledTimes(2);
  });
});
