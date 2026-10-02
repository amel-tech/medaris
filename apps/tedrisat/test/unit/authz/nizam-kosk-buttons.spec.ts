import {
  AUTHZ_EXEMPT_KEY,
  AUTHZ_KEY,
  type AuthzMeta,
  ENTITIES,
  type Entity,
  MATRIX,
  ROLES,
  type Role,
  SCOPES,
  type Scope,
} from "@medaris/common";
import { CourseController } from "../../../src/course/course.controller";
import { LessonController } from "../../../src/course/lesson.controller";
import { KoskController } from "../../../src/kosk/kosk.controller";

/**
 * Every button nizam's köşk screens show, the tedrisat routes it ends up
 * calling, and the `/me` roles nizam shows it to (MDRS-108). The rule is that
 * no button nizam shows leads its viewer to a 403.
 *
 * Two halves pin it, because nizam cannot import the matrix (`platform:web`
 * may not depend on `platform:node`):
 *   - this spec: each route really carries that scope, and every role in
 *     `shownTo` holds it in `MATRIX`;
 *   - `apps/nizam/test/kosk-abilities.spec.ts`: nizam's gating functions show
 *     each button to exactly the same `shownTo` roles.
 * A change to either side has to change this table and that one together.
 *
 * Roles are relative to the route's entity: KOSK_MANAGER on a course is the
 * manager of its köşk (`resolveCourseRole`), which is what `/me`'s
 * `roles.manages` reports. SYSTEM_ADMIN bypasses the matrix and is shown
 * every button. MADRASAH_NAZIR comes from `roles.nazirOf`, empty until role
 * model v2 (MDRS-142) fills it.
 */
interface ButtonRoute {
  controller: { prototype: object };
  handler: string;
  entity: Entity;
  scope: Scope;
}
interface Button {
  button: string;
  routes: ButtonRoute[];
  shownTo: Role[];
}

const kosk = (handler: string, scope: Scope): ButtonRoute => ({
  controller: KoskController,
  handler,
  entity: ENTITIES.KOSK,
  scope,
});
const courseRoute = (
  controller: { prototype: object },
  handler: string,
  scope: Scope,
  entity: Entity = ENTITIES.COURSE
): ButtonRoute => ({ controller, handler, entity, scope });

const NIZAM_KOSK_BUTTONS: Button[] = [
  {
    button: "Köşkü Düzenle (köşk detail)",
    routes: [kosk("update", SCOPES.EDIT)],
    shownTo: [ROLES.KOSK_MANAGER, ROLES.MADRASAH_NAZIR],
  },
  {
    // The new-course page creates the course, then plans its sessions on it.
    button: "Yeni Ders Aç (köşk detail)",
    routes: [
      courseRoute(
        CourseController,
        "create",
        SCOPES.MANAGE_COURSES,
        ENTITIES.KOSK
      ),
      courseRoute(LessonController, "previewBatch", SCOPES.EDIT),
      courseRoute(LessonController, "createBatch", SCOPES.EDIT),
    ],
    shownTo: [ROLES.KOSK_MANAGER],
  },
  {
    button: "Bekleyen talepler (köşk detail)",
    routes: [
      courseRoute(
        CourseController,
        "pendingEnrollments",
        SCOPES.MANAGE_COURSES,
        ENTITIES.KOSK
      ),
      courseRoute(
        CourseController,
        "approveEnrollment",
        SCOPES.MANAGE_ENROLLMENTS
      ),
      courseRoute(
        CourseController,
        "rejectEnrollment",
        SCOPES.MANAGE_ENROLLMENTS
      ),
    ],
    shownTo: [ROLES.KOSK_MANAGER],
  },
  {
    // A course card on the köşk detail, and a course under "Verdiğiniz
    // dersler" on the list, open the course editor.
    button: "Course editor (course card, taught course)",
    routes: [
      courseRoute(CourseController, "replace", SCOPES.EDIT),
      courseRoute(LessonController, "previewBatch", SCOPES.EDIT),
      courseRoute(LessonController, "createBatch", SCOPES.EDIT),
      courseRoute(LessonController, "update", SCOPES.EDIT),
      courseRoute(LessonController, "archive", SCOPES.EDIT),
    ],
    shownTo: [ROLES.KOSK_MANAGER, ROLES.MUDERRIS],
  },
  {
    button: "Kayıtlar (course editor → roster)",
    routes: [
      courseRoute(CourseController, "enrollments", SCOPES.MANAGE_ENROLLMENTS),
      courseRoute(
        CourseController,
        "setEnrollmentStatus",
        SCOPES.MANAGE_ENROLLMENTS
      ),
      courseRoute(
        CourseController,
        "removeEnrollment",
        SCOPES.MANAGE_ENROLLMENTS
      ),
    ],
    shownTo: [ROLES.KOSK_MANAGER, ROLES.MUDERRIS],
  },
];

const authzOf = (route: ButtonRoute): AuthzMeta | undefined => {
  const handler = (route.controller.prototype as Record<string, unknown>)[
    route.handler
  ];
  if (typeof handler !== "function") {
    throw new Error(`No handler ${route.handler}`);
  }
  return Reflect.getMetadata(AUTHZ_KEY, handler) as AuthzMeta | undefined;
};

describe("nizam köşk buttons ↔ the matrix (MDRS-108)", () => {
  it.each(
    NIZAM_KOSK_BUTTONS.flatMap((b) =>
      b.routes.map((r) => [b.button, r.handler, r] as const)
    )
  )("%s → %s carries the scope the table names", (_button, _handler, route) => {
    expect(authzOf(route)?.scope).toBe(route.scope);
  });

  it.each(
    NIZAM_KOSK_BUTTONS.flatMap((b) =>
      b.routes.flatMap((r) =>
        b.shownTo.map((role) => [b.button, role, r] as const)
      )
    )
  )("%s is shown to %s, who may call every route behind it", (_button, role, route) => {
    expect(MATRIX[route.entity][role] ?? []).toContain(route.scope);
  });

  it("the müderris picker is the manager's alone, as ASSIGN_MUDERRIS is", () => {
    // Shown by `mayAssignMuderris`; checked inside the whole-course save, not
    // by a route decorator, so it is pinned here against the matrix directly.
    const holders = Object.entries(MATRIX[ENTITIES.COURSE])
      .filter(([, scopes]) => scopes?.includes(SCOPES.ASSIGN_MUDERRIS))
      .map(([role]) => role);
    expect(holders).toEqual([ROLES.KOSK_MANAGER]);
  });

  it("Yeni Köşk is SYSTEM_ADMIN's alone, as CREATE_KOSK is on no köşk row", () => {
    // Shown by `mayCreateKosk`. Since 2026-10-02 `POST /kosks` is
    // `@Authz(CREATE_KOSK, forNew(KOSK))`, and only the realm bypass holds it.
    const handler = KoskController.prototype.create;
    expect(Reflect.getMetadata(AUTHZ_EXEMPT_KEY, handler)).toBeUndefined();
    expect(Reflect.getMetadata(AUTHZ_KEY, handler)).toEqual(
      expect.objectContaining({ scope: SCOPES.CREATE_KOSK })
    );
    const holders = Object.entries(MATRIX[ENTITIES.KOSK])
      .filter(([, scopes]) => scopes?.includes(SCOPES.CREATE_KOSK))
      .map(([role]) => role);
    expect(holders).toEqual([]);
  });

  it("the köşk list itself is exempt, with or without managedBy=me", () => {
    const handler = KoskController.prototype.findAll;
    expect(Reflect.getMetadata(AUTHZ_EXEMPT_KEY, handler)).toBe(true);
  });
});
