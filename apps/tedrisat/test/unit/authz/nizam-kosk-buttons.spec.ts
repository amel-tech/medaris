import {
  ASSIGNED_ROLES,
  type AssignedRole,
  AUTHZ_EXEMPT_KEY,
  AUTHZ_KEY,
  AUTHZ_PUBLIC_KEY,
  type AuthzMeta,
  ENTITIES,
  type Entity,
  PERMISSIONS,
  type PermissionCode,
} from "@medaris/common";
import { CourseController } from "../../../src/course/course.controller";
import { LessonController } from "../../../src/course/lesson.controller";
import { KoskController } from "../../../src/kosk/kosk.controller";
import {
  heldByRole,
  permissionsOf,
  rolesHolding,
  rolesWithDefault,
} from "../../helpers/authz-holders";

/**
 * Every button nizam's köşk screens show, the tedrisat routes it ends up
 * calling, and the roles nizam shows it to (MDRS-108). The rule is that no
 * button nizam shows leads its viewer to a 403.
 *
 * Two halves pin it, because nizam cannot import the catalogue
 * (`platform:web` may not depend on `platform:node`):
 *   - this spec: each route really carries that permission, and every role in
 *     `shownTo` holds one of the permissions behind it (the engine's own
 *     computation, `effectivePermissions`, not a table kept beside it);
 *   - `apps/nizam/test/kosk-abilities.spec.ts`: nizam's gating functions show
 *     each button to exactly the same `shownTo` roles.
 * A change to either side has to change this table and that one together.
 *
 * Roles are relative to the route's entity: KOSK_NAZIM on a course is the
 * nazım of its köşk, which is what `/me`'s `roles.manages` reports.
 * SYSTEM_ADMIN bypasses the decision and is shown every button.
 */
interface ButtonRoute {
  controller: { prototype: object };
  handler: string;
  entity: Entity;
  /** The permission the route needs; with several, any one of them will do. */
  permission: readonly PermissionCode[];
}
interface Button {
  button: string;
  routes: ButtonRoute[];
  shownTo: AssignedRole[];
}

const P = PERMISSIONS;

const kosk = (
  handler: string,
  ...permission: PermissionCode[]
): ButtonRoute => ({
  controller: KoskController,
  handler,
  entity: ENTITIES.KOSK,
  permission,
});
const route = (
  controller: { prototype: object },
  handler: string,
  entity: Entity,
  ...permission: PermissionCode[]
): ButtonRoute => ({ controller, handler, entity, permission });

const NIZAM_KOSK_BUTTONS: Button[] = [
  {
    button: "Köşkü Düzenle (köşk detail)",
    routes: [kosk("update", P.KOSK_MANAGE, P.PLATFORM_KOSK_EDIT)],
    // No medrese role: a hosting right gives no power over the köşk (MDRS-134).
    shownTo: [ASSIGNED_ROLES.KOSK_NAZIM],
  },
  {
    // The new-course page creates the course, then plans its sessions on it.
    button: "Yeni Ders Aç (köşk detail)",
    routes: [
      route(
        CourseController,
        "create",
        ENTITIES.KOSK,
        P.COURSE_OPEN_STANDALONE
      ),
      route(
        LessonController,
        "previewBatch",
        ENTITIES.COURSE,
        P.SESSION_MANAGE
      ),
      route(LessonController, "createBatch", ENTITIES.COURSE, P.SESSION_MANAGE),
    ],
    shownTo: [ASSIGNED_ROLES.KOSK_NAZIM],
  },
  {
    button: "Bekleyen talepler (köşk detail)",
    routes: [
      route(
        CourseController,
        "pendingEnrollments",
        ENTITIES.KOSK,
        P.COURSE_MANAGE_ALL
      ),
      route(
        CourseController,
        "approveEnrollment",
        ENTITIES.COURSE,
        P.ENROLLMENT_DECIDE
      ),
      route(
        CourseController,
        "rejectEnrollment",
        ENTITIES.COURSE,
        P.ENROLLMENT_DECIDE
      ),
    ],
    shownTo: [ASSIGNED_ROLES.KOSK_NAZIM],
  },
  {
    // A course card on the köşk detail, and a course under "Verdiğiniz
    // dersler" on the list, open the course editor.
    button: "Course editor (course card, taught course)",
    routes: [
      route(CourseController, "replace", ENTITIES.COURSE, P.COURSE_EDIT),
      route(
        LessonController,
        "previewBatch",
        ENTITIES.COURSE,
        P.SESSION_MANAGE
      ),
      route(LessonController, "createBatch", ENTITIES.COURSE, P.SESSION_MANAGE),
      route(LessonController, "update", ENTITIES.COURSE, P.SESSION_MANAGE),
      // Hiding a session is `week.hide` or `session.manage` (MDRS-143).
      route(
        LessonController,
        "archive",
        ENTITIES.COURSE,
        P.WEEK_HIDE,
        P.SESSION_MANAGE
      ),
    ],
    shownTo: [ASSIGNED_ROLES.KOSK_NAZIM, ASSIGNED_ROLES.MUDERRIS],
  },
  {
    button: "Kayıtlar (course editor → roster)",
    routes: [
      route(
        CourseController,
        "enrollments",
        ENTITIES.COURSE,
        P.COURSE_STAFF_READ
      ),
      route(
        CourseController,
        "setEnrollmentStatus",
        ENTITIES.COURSE,
        P.ENROLLMENT_COMPLETE
      ),
      route(
        CourseController,
        "removeEnrollment",
        ENTITIES.COURSE,
        P.ENROLLMENT_REMOVE
      ),
    ],
    shownTo: [ASSIGNED_ROLES.KOSK_NAZIM, ASSIGNED_ROLES.MUDERRIS],
  },
];

const authzOf = (r: ButtonRoute): AuthzMeta | undefined => {
  const handler = (r.controller.prototype as Record<string, unknown>)[
    r.handler
  ];
  if (typeof handler !== "function") {
    throw new Error(`No handler ${r.handler}`);
  }
  return Reflect.getMetadata(AUTHZ_KEY, handler) as AuthzMeta | undefined;
};

describe("nizam köşk buttons ↔ the permission catalogue (MDRS-108, MDRS-135)", () => {
  it.each(
    NIZAM_KOSK_BUTTONS.flatMap((b) =>
      b.routes.map((r) => [b.button, r.handler, r] as const)
    )
  )("%s → %s carries the permission the table names", (_button, _handler, r) => {
    const meta = authzOf(r);
    expect(meta && permissionsOf(meta)).toEqual(r.permission);
  });

  it.each(
    NIZAM_KOSK_BUTTONS.flatMap((b) =>
      b.routes.flatMap((r) =>
        b.shownTo.map((role) => [b.button, role, r] as const)
      )
    )
  )("%s is shown to %s, who may call every route behind it", (_button, role, r) => {
    const held = heldByRole(role, r.entity);
    expect(r.permission.some((code) => held.has(code))).toBe(true);
  });

  it("the müderris picker is the köşk nazımı's alone, as choosing müderrisler is part of opening a course", () => {
    // Shown by `mayAssignMuderris`; checked inside the whole-course save, not
    // by a route decorator, so it is pinned here against the catalogue. In a
    // course held for a medrese the picker is the medrese's (owner, 1 October).
    expect(
      rolesHolding(
        [P.COURSE_OPEN_STANDALONE, P.MADRASAH_MUDERRIS_MANAGE],
        ENTITIES.COURSE
      )
    ).toEqual([ASSIGNED_ROLES.KOSK_NAZIM]);
    expect(
      rolesHolding(
        [P.COURSE_OPEN_STANDALONE, P.MADRASAH_MUDERRIS_MANAGE],
        ENTITIES.COURSE,
        { madrasahCourse: true }
      )
    ).toEqual([ASSIGNED_ROLES.MEDRESE_BASMUDERRIS]);
  });

  it("Yeni Köşk is the başnazım's and a Medaris nazımı's who was given it, never a role's own", () => {
    // Shown by `mayCreateKosk`. Since 2026-10-02 `POST /kosks` is
    // `@Authz(platform.kosk_create, forNew(KOSK))`: the realm bypass passes,
    // and so does a Medaris nazımı holding the permission by a grant.
    const handler = KoskController.prototype.create;
    expect(Reflect.getMetadata(AUTHZ_EXEMPT_KEY, handler)).toBeUndefined();
    expect(Reflect.getMetadata(AUTHZ_KEY, handler)).toEqual(
      expect.objectContaining({ permission: P.PLATFORM_KOSK_CREATE })
    );
    expect(rolesWithDefault(P.PLATFORM_KOSK_CREATE)).toEqual([]);
    expect(rolesHolding([P.PLATFORM_KOSK_CREATE], ENTITIES.KOSK)).toEqual([]);
  });

  // The list needs no role: since MDRS-122 it is `@AuthzPublic()`, open even
  // without a token, and `managedBy=me` narrows it to the caller's own köşks.
  it("the köşk list needs no role, with or without managedBy=me", () => {
    const handler = KoskController.prototype.findAll;
    expect(Reflect.getMetadata(AUTHZ_PUBLIC_KEY, handler)).toBe(true);
    expect(Reflect.getMetadata(AUTHZ_KEY, handler)).toBeUndefined();
  });
});
