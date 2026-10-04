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
import type { ArchiveItemType } from "../../../src/archive/archive-types";
import {
  COURSE_ARCHIVE_READ_CODES,
  COURSE_HIDE_LADDER,
  DECK_HIDE_LADDER,
  hideTargetOf,
  KOSK_ARCHIVE_READ_CODES,
  KOSK_HIDE_LADDER,
  MADRASAH_ARCHIVE_READ_CODES,
  MADRASAH_HIDE_LADDER,
  SESSION_HIDE_LADDER,
  WEEK_HIDE_LADDER,
} from "../../../src/archive/hide-codes";
import { actingLevel, type HideLevel } from "../../../src/archive/hide-level";

/**
 * MDRS-143, "hiding and restoring are catalogue permissions": who acts at
 * which level on each kind of item, asked of the real engine (the pure
 * `effectivePermissions`) with the holdings a role has, so the table cannot
 * drift from the catalogue's role defaults.
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

const item = (type: ArchiveItemType, id = COURSE) => ({
  type,
  id,
  koskId: KOSK,
  courseId: type === "kosk" || type === "deck" ? null : COURSE,
});

const levelOf = async (
  type: ArchiveItemType,
  authz: AuthzService
): Promise<HideLevel | null> => {
  const target = hideTargetOf(item(type, type === "kosk" ? KOSK : COURSE));
  if (!target) return null;
  return actingLevel(authz, { sub: "u" }, target.resource, target.ladder, null);
};

describe("hiding and restoring by catalogue code (MDRS-143)", () => {
  describe("the table", () => {
    it("pins who acts at which level, per kind of item", () => {
      const rows = (ladder: typeof COURSE_HIDE_LADDER) =>
        ladder.map((step) => [step.level, [...step.codes]]);
      expect({
        kosk: rows(KOSK_HIDE_LADDER),
        madrasah: rows(MADRASAH_HIDE_LADDER),
        course: rows(COURSE_HIDE_LADDER),
        week: rows(WEEK_HIDE_LADDER),
        session: rows(SESSION_HIDE_LADDER),
        deck: rows(DECK_HIDE_LADDER),
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
          ["kosk", [P.COURSE_HIDE]],
          ["madrasah", [P.MADRASAH_COURSE_HIDE]],
        ],
        week: [
          ["course", [P.WEEK_HIDE]],
          ["kosk", [P.COURSE_HIDE]],
          ["madrasah", [P.MADRASAH_COURSE_HIDE]],
        ],
        session: [
          ["course", [P.WEEK_HIDE, P.SESSION_MANAGE]],
          ["kosk", [P.COURSE_HIDE]],
          ["madrasah", [P.MADRASAH_COURSE_HIDE]],
        ],
        deck: [["kosk", [P.KOSK_MANAGE]]],
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

    it("asks a course's codes on the course, a week's and a session's on their course, a köşk's on the köşk", () => {
      expect(hideTargetOf(item("course"))?.resource).toEqual({
        entity: ENTITIES.COURSE,
        id: COURSE,
      });
      expect(hideTargetOf(item("week", "w1"))?.resource).toEqual({
        entity: ENTITIES.COURSE,
        id: COURSE,
      });
      expect(hideTargetOf(item("session", "s1"))?.resource).toEqual({
        entity: ENTITIES.COURSE,
        id: COURSE,
      });
      expect(hideTargetOf(item("kosk", KOSK))?.resource).toEqual({
        entity: ENTITIES.KOSK,
        id: KOSK,
      });
      expect(hideTargetOf(item("deck", "d1"))?.resource).toEqual({
        entity: ENTITIES.KOSK,
        id: KOSK,
      });
    });

    it("has no target for a type with no storage or a week with no course", () => {
      expect(hideTargetOf(item("recording"))).toBeNull();
      expect(hideTargetOf(item("madrasah"))).toBeNull();
      expect(
        hideTargetOf({ type: "week", id: "w", koskId: KOSK, courseId: null })
      ).toBeNull();
    });
  });

  describe("the level a role acts at, from the catalogue's own defaults", () => {
    it("a müderris acts at the course for weeks and sessions and at no level for a course", async () => {
      const authz = authzFor(R.MUDERRIS);
      expect(await levelOf("week", authz)).toBe("course");
      expect(await levelOf("session", authz)).toBe("course");
      // `course.hide` is köşk-scoped and no role of the course holds it: this
      // is why "a müderris hides a course only with the permission" has no
      // permission to name (d-1004-14 leaves it to the owner).
      expect(await levelOf("course", authz)).toBeNull();
    });

    it("a köşk nazımı acts at the köşk for a course, its weeks, its sessions, its köşk and its decks", async () => {
      const authz = authzFor(R.KOSK_NAZIM);
      for (const type of ["course", "week", "session"] as const) {
        expect(await levelOf(type, authz)).toBe("kosk");
      }
      expect(await levelOf("kosk", authz)).toBe("kosk");
      expect(await levelOf("deck", authz)).toBe("kosk");
    });

    it("a başmüderris acts at the medrese for a medrese's course and at no level for a köşk's own", async () => {
      const inMedrese = authzFor(R.MEDRESE_BASMUDERRIS, {
        madrasahCourse: true,
      });
      for (const type of ["course", "week", "session"] as const) {
        expect(await levelOf(type, inMedrese)).toBe("madrasah");
      }
      // The medrese is not on the chain of a course the köşk keeps for itself.
      const outside = authzFor(R.MEDRESE_BASMUDERRIS);
      for (const type of ["course", "week", "session"] as const) {
        expect(await levelOf(type, outside)).toBeNull();
      }
      // And a başmüderris hides no köşk: `kosk.manage` is the köşk's.
      expect(await levelOf("kosk", inMedrese)).toBeNull();
    });

    it("a ders nazırı and a medrese nazırı hold nothing until granted", async () => {
      for (const role of [R.DERS_NAZIR, R.MEDRESE_NAZIR, R.MEDARIS_NAZIM]) {
        const authz = authzFor(role);
        for (const type of ["course", "week", "session", "kosk"] as const) {
          expect(await levelOf(type, authz)).toBeNull();
        }
      }
    });

    it("a ders nazırı granted week.hide hides and restores a week and a session, not a course", async () => {
      const authz = authzFor(R.DERS_NAZIR, {
        grants: [grant([P.WEEK_HIDE], courseScope)],
      });
      expect(await levelOf("week", authz)).toBe("course");
      expect(await levelOf("session", authz)).toBe("course");
      expect(await levelOf("course", authz)).toBeNull();
    });

    it("a ders nazırı granted only course.edit holds no rung", async () => {
      const authz = authzFor(R.DERS_NAZIR, {
        grants: [grant([P.COURSE_EDIT], courseScope)],
      });
      expect(await levelOf("week", authz)).toBeNull();
      expect(await levelOf("session", authz)).toBeNull();
    });

    it("session.manage alone brings a session back but not a week", async () => {
      const authz = authzFor(R.DERS_NAZIR, {
        grants: [grant([P.SESSION_MANAGE], courseScope)],
      });
      expect(await levelOf("session", authz)).toBe("course");
      expect(await levelOf("week", authz)).toBeNull();
    });

    it("a medrese nazırı granted madrasah.course_hide acts at the medrese for a medrese's course", async () => {
      const authz = authzFor(R.MEDRESE_NAZIR, {
        madrasahCourse: true,
        grants: [grant([P.MADRASAH_COURSE_HIDE], madrasahScope)],
      });
      for (const type of ["course", "week", "session"] as const) {
        expect(await levelOf(type, authz)).toBe("madrasah");
      }
    });

    it("a Medaris nazımı granted platform.kosk_edit acts at the platform for a köşk and at no level for its courses", async () => {
      const authz = authzFor(R.MEDARIS_NAZIM, {
        grants: [grant([P.PLATFORM_KOSK_EDIT])],
      });
      expect(await levelOf("kosk", authz)).toBe("platform");
      // No platform code hides a course, a week or a session (d-1004-03 logic).
      for (const type of ["course", "week", "session"] as const) {
        expect(await levelOf(type, authz)).toBeNull();
      }
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
      for (const type of [
        "course",
        "week",
        "session",
        "kosk",
        "deck",
      ] as const) {
        expect(await levelOf(type, admin)).toBe("platform");
      }
    });
  });
});
