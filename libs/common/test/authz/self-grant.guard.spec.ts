import {
  ASSIGNED_ROLES,
  type AuthzAuditSink,
  type AuthzService,
  ENTITIES,
  type IAuthzAuditEntry,
  type IEffective,
  PERMISSIONS,
  type PermissionCode,
  ROLE_DEFAULT_PERMISSIONS,
  SelfGrantGuard,
  SelfGrantRefusedError,
} from "../../src";

const ME = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER = "aaaaaaaa-0000-4000-8000-000000000002";
const resource = {
  entity: ENTITIES.MADRASAH,
  id: "bbbbbbbb-0000-4000-8000-000000000001",
};

const user = (sub: string, admin = false) => ({
  sub,
  realm_access: { roles: admin ? ["SYSTEM_ADMIN"] : [] },
});

function build(held: readonly PermissionCode[]) {
  const records: IAuthzAuditEntry[] = [];
  const authz = {
    isSystemAdmin: (u: { realm_access?: { roles?: string[] } }) =>
      u.realm_access?.roles?.includes("SYSTEM_ADMIN") === true,
    effective: async (): Promise<IEffective> => ({
      codes: new Set(held),
      openedPassive: null,
    }),
  } as unknown as AuthzService;
  const audit: AuthzAuditSink = {
    record: async (entry) => {
      records.push(entry);
    },
  };
  return { guard: new SelfGrantGuard(authz, audit), records };
}

describe("SelfGrantGuard (review B1, M4)", () => {
  it("lets SYSTEM_ADMIN name themselves", async () => {
    const { guard, records } = build([]);
    await expect(
      guard.assertNotSelf(
        user(ME, true),
        [ME],
        resource,
        { role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS, always: true },
        "test"
      )
    ).resolves.toBeUndefined();
    expect(records).toHaveLength(0);
  });

  it("does not look at anyone else's appointment", async () => {
    const { guard } = build([]);
    await expect(
      guard.assertNotSelf(
        user(ME),
        [OTHER],
        resource,
        { role: ASSIGNED_ROLES.MUDERRIS },
        "test"
      )
    ).resolves.toBeUndefined();
  });

  it("refuses an `always` path and writes the attempt to the audit log", async () => {
    const { guard, records } = build(ROLE_DEFAULT_PERMISSIONS.MUDERRIS);
    await expect(
      guard.assertNotSelf(
        user(ME),
        [OTHER, ME.toUpperCase()],
        resource,
        { always: true },
        "madrasah.nazir.appoint"
      )
    ).rejects.toBeInstanceOf(SelfGrantRefusedError);
    expect(records).toEqual([
      {
        actorId: ME,
        action: "permission.self_grant_refused",
        entity: ENTITIES.MADRASAH,
        entityId: resource.id,
        details: { route: "madrasah.nazir.appoint", role: null, codes: [] },
      },
    ]);
  });

  it("lets someone name themselves into what they already hold, and refuses one code more", async () => {
    const all = ROLE_DEFAULT_PERMISSIONS.MUDERRIS;
    const covered = build(all);
    await expect(
      covered.guard.assertNotSelf(
        user(ME),
        [ME],
        resource,
        { role: ASSIGNED_ROLES.MUDERRIS },
        "test"
      )
    ).resolves.toBeUndefined();

    const short = build(all.filter((code) => code !== PERMISSIONS.COURSE_EDIT));
    await expect(
      short.guard.assertNotSelf(
        user(ME),
        [ME],
        resource,
        { role: ASSIGNED_ROLES.MUDERRIS },
        "test"
      )
    ).rejects.toBeInstanceOf(SelfGrantRefusedError);
    expect(short.records[0].details).toMatchObject({
      codes: expect.arrayContaining([PERMISSIONS.COURSE_EDIT]),
    });
  });

  it("reads the caller's holdings at `heldAt`, and records the refusal on the resource", async () => {
    const course = {
      entity: ENTITIES.COURSE,
      id: "bbbbbbbb-0000-4000-8000-000000000009",
    };
    const asked: string[] = [];
    const records: IAuthzAuditEntry[] = [];
    const authz = {
      isSystemAdmin: () => false,
      effective: async (
        _u: unknown,
        at: { id: string }
      ): Promise<IEffective> => {
        asked.push(at.id);
        return {
          codes: new Set(
            at.id === resource.id ? ROLE_DEFAULT_PERMISSIONS.MUDERRIS : []
          ),
          openedPassive: null,
        };
      },
    } as unknown as AuthzService;
    const guard = new SelfGrantGuard(authz, {
      record: async (entry) => {
        records.push(entry);
      },
    });
    await expect(
      guard.assertNotSelf(
        user(ME),
        [ME],
        course,
        { role: ASSIGNED_ROLES.MUDERRIS, heldAt: resource },
        "test"
      )
    ).resolves.toBeUndefined();
    await expect(
      guard.assertNotSelf(
        user(ME),
        [ME],
        course,
        { role: ASSIGNED_ROLES.MUDERRIS },
        "test"
      )
    ).rejects.toBeInstanceOf(SelfGrantRefusedError);
    expect(asked).toEqual([resource.id, course.id]);
    expect(records).toMatchObject([
      { entity: ENTITIES.COURSE, entityId: course.id },
    ]);
  });

  it("holding nothing at all refuses even a single code", async () => {
    const { guard } = build([]);
    await expect(
      guard.assertNotSelf(
        user(ME),
        [ME],
        resource,
        { codes: [PERMISSIONS.MADRASAH_STUDENTS_VIEW] },
        "test"
      )
    ).rejects.toMatchObject({ code: "SELF_GRANT_REFUSED" });
  });
});
