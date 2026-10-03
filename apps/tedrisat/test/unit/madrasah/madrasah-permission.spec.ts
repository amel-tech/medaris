import type { AuthzService } from "@medaris/common";
import { describe, expect, it, vi } from "vitest";
import {
  PermissionGroupEmptyError,
  PermissionGroupNameTakenError,
  PermissionGroupNotFoundError,
  UnknownPermissionError,
  UsersPolicyRequiredError,
} from "../../../src/assignment/admin/errors";
import type { PermissionAdminRepository } from "../../../src/assignment/admin/permission-admin.repository";
import { NazirCourseScopeError } from "../../../src/madrasah/errors/nazir-course-scope.error";
import { NazirNotFoundError } from "../../../src/madrasah/errors/nazir-not-found.error";
import { PermissionNotGivableError } from "../../../src/madrasah/errors/permission-not-givable.error";
import type { MadrasahService } from "../../../src/madrasah/madrasah.service";
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
  const madrasahs = {
    isNazir: vi.fn().mockImplementation(async (_m, id) => id === "a2"),
  };
  const authz = {
    isSystemAdmin: (u: { realm_access?: { roles?: string[] } }) =>
      u.realm_access?.roles?.includes("SYSTEM_ADMIN") ?? false,
  };
  const service = new MadrasahPermissionService(
    repo as unknown as MadrasahNazirRepository,
    nazirs as unknown as MadrasahNazirService,
    groups as unknown as PermissionAdminRepository,
    madrasahs as unknown as MadrasahService,
    authz as unknown as AuthzService
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
    expect(head.madrasah).toHaveLength(10);
    expect(head.course).toHaveLength(21);
    expect(head.givable).toHaveLength(31);
    expect((await service.catalog(ADMIN, M)).givable).toHaveLength(31);
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
    expect(used.groups.deleteGroup).toHaveBeenCalledWith("a2", G, "revoke");

    const free = build();
    await free.service.deleteGroup(HEAD, M, G, undefined);
    expect(free.groups.deleteGroup).toHaveBeenCalledWith("a2", G, null);
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
