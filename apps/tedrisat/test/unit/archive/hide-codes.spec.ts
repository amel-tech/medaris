import {
  ASSIGNED_ROLES,
  type AssignedRole,
  type AuthenticatedUser,
  type AuthzService,
  ENTITIES,
  effectivePermissions,
  type IHeldGrantCodes,
  PERMISSIONS,
  type PermissionCode,
  RELATIONS,
  SCOPE_TYPES,
  type ScopeRef,
} from "@medaris/common";
import {
  COURSE_ARCHIVE_READ_CODES,
  KOSK_ARCHIVE_READ_CODES,
  MADRASAH_ARCHIVE_READ_CODES,
} from "../../../src/archive/hide-codes";
import {
  actingLevel,
  BARE_WEEK_HIDE_LADDER,
  COURSE_HIDE_LADDER,
  type HideLevel,
  type IHideStep,
  KOSK_HIDE_LADDER,
  MADRASAH_HIDE_LADDER,
  SECTION_HIDE_LADDER,
} from "../../../src/archive/hide-level";

/**
 * MDRS-143, "hiding and restoring are catalogue permissions": who acts at
 * which level on each kind of item, asked of the real engine (the pure
 * `effectivePermissions`) with the holdings a role has, so the ladders of
 * `hide-level.ts` cannot drift from the catalogue's role defaults.
 */
const P = PERMISSIONS;
const R = ASSIGNED_ROLES;
const KOSK = "a2000000-0000-4000-8000-0000000000aa";
const MADRASAH = "a2000000-0000-4000-8000-0000000000bb";
const COURSE = "a2000000-0000-4000-8000-0000000000cc";
const platform: ScopeRef = { type: SCOPE_TYPES.PLATFORM, id: null };
const koskScope: ScopeRef = { type: SCOPE_TYPES.KOSK, id: KOSK };
const madrasahScope: ScopeRef = { type: SCOPE_TYPES.MADRASAH, id: MADRASAH };
const courseScope: ScopeRef = { type: SCOPE_TYPES.COURSE, id: COURSE };

const scopeOf = (role: AssignedRole): ScopeRef => {
  switch (role) {
    case R.MEDARIS_NAZIM:
      return platform;
    case R.KOSK_NAZIM:
      return koskScope;
    case R.MEDRESE_BASMUDERRIS:
    case R.MEDRESE_NAZIR:
      return madrasahScope;
    default:
      return courseScope;
  }
};

const grant = (
  codes: PermissionCode[],
  scope: ScopeRef = platform
): IHeldGrantCodes => ({ scope, codes, authority: null });

/** The caller's engine answer on a resource, with the chain a köşk's own course or a medrese's has. */
function authzFor(
  role: AssignedRole,
  options: { grants?: IHeldGrantCodes[]; madrasahCourse?: boolean } = {}
): AuthzService {
  return {
    isSystemAdmin: () => false,
    effective: async (_user: AuthenticatedUser, resource: { entity: string }) =>
      effectivePermissions(
        {
          entity: resource.entity as never,
          relation: RELATIONS.PUBLIC,
          chain:
            resource.entity === ENTITIES.KOSK
              ? [koskScope, platform]
              : resource.entity === ENTITIES.MADRASAH
                ? [madrasahScope, platform]
                : options.madrasahCourse
                  ? [courseScope, madrasahScope, koskScope, platform]
                  : [courseScope, koskScope, platform],
          madrasahCourse: options.madrasahCourse ?? false,
          passiveScope: null,
          policies: [],
        },
        [{ role, scope: scopeOf(role) }],
        options.grants ?? []
      ),
  } as unknown as AuthzService;
}

/** The kinds of item the ladders decide, with where the engine is asked and which ladder reads it. */
type Kind = "course" | "week" | "weekWithSessions" | "session" | "kosk";
const ASKED: Record<
  Kind,
  { resource: { entity: string; id: string }; ladder: readonly IHideStep[] }
> = {
  course: {
    resource: { entity: ENTITIES.COURSE, id: COURSE },
    ladder: COURSE_HIDE_LADDER,
  },
  // A week that brings no session back, and one that does (the repository
  // decides which under the row lock).
  week: {
    resource: { entity: ENTITIES.COURSE, id: COURSE },
    ladder: BARE_WEEK_HIDE_LADDER,
  },
  weekWithSessions: {
    resource: { entity: ENTITIES.COURSE, id: COURSE },
    ladder: SECTION_HIDE_LADDER,
  },
  session: {
    resource: { entity: ENTITIES.COURSE, id: COURSE },
    ladder: SECTION_HIDE_LADDER,
  },
  kosk: {
    resource: { entity: ENTITIES.KOSK, id: KOSK },
    ladder: KOSK_HIDE_LADDER,
  },
};

const levelOf = (kind: Kind, authz: AuthzService): Promise<HideLevel | null> =>
  actingLevel(
    authz,
    { sub: "u" },
    ASKED[kind].resource as never,
    ASKED[kind].ladder,
    null
  );

describe("hiding and restoring by catalogue code (MDRS-143)", () => {
  describe("the table", () => {
    it("pins who acts at which level, per kind of item", () => {
      const rows = (ladder: readonly IHideStep[]) =>
        ladder.map((step) => [step.level, [...step.codes]]);
      expect({
        kosk: rows(KOSK_HIDE_LADDER),
        madrasah: rows(MADRASAH_HIDE_LADDER),
        course: rows(COURSE_HIDE_LADDER),
        section: rows(SECTION_HIDE_LADDER),
        bareWeek: rows(BARE_WEEK_HIDE_LADDER),
      }).toEqual({
        kosk: [
          ["platform", [P.PLATFORM_KOSK_EDIT]],
          ["kosk", [P.KOSK_MANAGE]],
        ],
        madrasah: [
          ["platform", [P.PLATFORM_MADRASAH_EDIT]],
          ["madrasah", [P.MADRASAH_HIDE]],
        ],
        course: [
          ["platform", [P.PLATFORM_COURSE_HIDE]],
          ["kosk", [P.COURSE_HIDE]],
          ["madrasah", [P.MADRASAH_COURSE_HIDE]],
        ],
        section: [
          ["platform", [P.PLATFORM_COURSE_HIDE]],
          ["kosk", [P.COURSE_HIDE]],
          ["madrasah", [P.MADRASAH_COURSE_HIDE]],
          ["course", [P.WEEK_HIDE, P.SESSION_MANAGE]],
        ],
        bareWeek: [
          ["platform", [P.PLATFORM_COURSE_HIDE]],
          ["kosk", [P.COURSE_HIDE]],
          ["madrasah", [P.MADRASAH_COURSE_HIDE]],
          ["course", [P.WEEK_HIDE, P.SESSION_MANAGE, P.COURSE_EDIT]],
        ],
      });
    });

    it("pins who reads an archive", () => {
      expect({
        kosk: [...KOSK_ARCHIVE_READ_CODES],
        madrasah: [...MADRASAH_ARCHIVE_READ_CODES],
        course: [...COURSE_ARCHIVE_READ_CODES],
      }).toEqual({
        kosk: [P.KOSK_MANAGE, P.PLATFORM_KOSK_EDIT],
        madrasah: [
          P.MADRASAH_COURSE_HIDE,
          P.MADRASAH_HIDE,
          P.PLATFORM_MADRASAH_EDIT,
          P.MADRASAH_SETTINGS_EDIT,
        ],
        course: [P.WEEK_HIDE],
      });
    });
  });

  describe("the level a role acts at, from the catalogue's own defaults", () => {
    const PLAIN = ["course", "week", "weekWithSessions", "session"] as const;

    it("a müderris acts at the course for weeks and sessions and at no level for a course", async () => {
      const authz = authzFor(R.MUDERRIS);
      for (const kind of ["week", "weekWithSessions", "session"] as const) {
        expect(await levelOf(kind, authz)).toBe("course");
      }
      // `course.hide` is köşk-scoped and no role of the course holds it: this
      // is why "a müderris hides a course only with the permission" has no
      // permission to name (d-1004-14 leaves it to the owner).
      expect(await levelOf("course", authz)).toBeNull();
    });

    it("a köşk nazımı acts at the köşk for a course, its weeks, its sessions and its köşk", async () => {
      const authz = authzFor(R.KOSK_NAZIM);
      for (const kind of [...PLAIN, "kosk"] as const) {
        expect(await levelOf(kind, authz)).toBe("kosk");
      }
    });

    it("a başmüderris acts at the medrese for a medrese's course and at no level for a köşk's own", async () => {
      const inMedrese = authzFor(R.MEDRESE_BASMUDERRIS, {
        madrasahCourse: true,
      });
      for (const kind of PLAIN) {
        expect(await levelOf(kind, inMedrese)).toBe("madrasah");
      }
      // The medrese is not on the chain of a course the köşk keeps for itself.
      const outside = authzFor(R.MEDRESE_BASMUDERRIS);
      for (const kind of PLAIN) {
        expect(await levelOf(kind, outside)).toBeNull();
      }
      // And a başmüderris hides no köşk: `kosk.manage` is the köşk's.
      expect(await levelOf("kosk", inMedrese)).toBeNull();
    });

    it("a ders nazırı, a medrese nazırı and a Medaris nazımı hold nothing until granted", async () => {
      for (const role of [R.DERS_NAZIR, R.MEDRESE_NAZIR, R.MEDARIS_NAZIM]) {
        const authz = authzFor(role);
        for (const kind of [...PLAIN, "kosk"] as const) {
          expect(await levelOf(kind, authz)).toBeNull();
        }
      }
    });

    it("a ders nazırı granted week.hide hides and restores a week and a session, not a course", async () => {
      const authz = authzFor(R.DERS_NAZIR, {
        grants: [grant([P.WEEK_HIDE], courseScope)],
      });
      for (const kind of ["week", "weekWithSessions", "session"] as const) {
        expect(await levelOf(kind, authz)).toBe("course");
      }
      expect(await levelOf("course", authz)).toBeNull();
    });

    it("a ders nazırı granted only course.edit brings back a week with no session in it, and nothing else (the reviewed rule)", async () => {
      const authz = authzFor(R.DERS_NAZIR, {
        grants: [grant([P.COURSE_EDIT], courseScope)],
      });
      expect(await levelOf("week", authz)).toBe("course");
      expect(await levelOf("weekWithSessions", authz)).toBeNull();
      expect(await levelOf("session", authz)).toBeNull();
      expect(await levelOf("course", authz)).toBeNull();
    });

    it("session.manage alone brings a session back, and a week whose sessions come back with it", async () => {
      const authz = authzFor(R.DERS_NAZIR, {
        grants: [grant([P.SESSION_MANAGE], courseScope)],
      });
      expect(await levelOf("session", authz)).toBe("course");
      expect(await levelOf("weekWithSessions", authz)).toBe("course");
      expect(await levelOf("course", authz)).toBeNull();
    });

    it("a medrese nazırı granted madrasah.course_hide acts at the medrese for a medrese's course", async () => {
      const authz = authzFor(R.MEDRESE_NAZIR, {
        madrasahCourse: true,
        grants: [grant([P.MADRASAH_COURSE_HIDE], madrasahScope)],
      });
      for (const kind of PLAIN) {
        expect(await levelOf(kind, authz)).toBe("madrasah");
      }
    });

    it("a Medaris nazımı granted platform.kosk_edit acts at the platform for a köşk and at no level for its courses", async () => {
      const authz = authzFor(R.MEDARIS_NAZIM, {
        grants: [grant([P.PLATFORM_KOSK_EDIT])],
      });
      expect(await levelOf("kosk", authz)).toBe("platform");
      // The platform code that hides a course is `platform.course_hide`.
      for (const kind of PLAIN) {
        expect(await levelOf(kind, authz)).toBeNull();
      }
    });

    it("a Medaris nazımı granted platform.course_hide acts at the platform for a course, its weeks and its sessions", async () => {
      const authz = authzFor(R.MEDARIS_NAZIM, {
        grants: [grant([P.PLATFORM_COURSE_HIDE])],
      });
      for (const kind of PLAIN) {
        expect(await levelOf(kind, authz)).toBe("platform");
      }
      expect(await levelOf("kosk", authz)).toBeNull();
    });

    it("a Medaris nazımı granted platform.madrasah_edit acts at the platform for a medrese", async () => {
      const authz = authzFor(R.MEDARIS_NAZIM, {
        grants: [grant([P.PLATFORM_MADRASAH_EDIT])],
      });
      const level = await actingLevel(
        authz,
        { sub: "u" },
        { entity: ENTITIES.MADRASAH, id: MADRASAH },
        MADRASAH_HIDE_LADDER,
        null
      );
      expect(level).toBe("platform");
    });

    it("the başnazım acts at the platform for everything", async () => {
      const admin = {
        isSystemAdmin: () => true,
        effective: async () => null,
      } as unknown as AuthzService;
      for (const kind of [...PLAIN, "kosk"] as const) {
        expect(await levelOf(kind, admin)).toBe("platform");
      }
    });
  });
});
