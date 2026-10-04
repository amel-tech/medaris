import {
  AUTHZ_KEY,
  type AuthzMeta,
  ENTITIES,
  MATRIX,
  ROLES,
  type Role,
  SCOPES,
  type Scope,
} from "@medaris/common";
import { MadrasahArchiveController } from "../../../src/archive/madrasah-archive.controller";
import { MadrasahBanController } from "../../../src/ban/madrasah-ban.controller";
import { MadrasahCourseController } from "../../../src/madrasah/course/madrasah-course.controller";
import { MadrasahController } from "../../../src/madrasah/madrasah.controller";
import { MadrasahNazirController } from "../../../src/madrasah/nazir/madrasah-nazir.controller";
import { MadrasahPermissionController } from "../../../src/madrasah/nazir/madrasah-permission.controller";
import { MadrasahPortalController } from "../../../src/madrasah/portal/madrasah-portal.controller";

/**
 * Every page under a medrese in the nazir portal's menu, and the tedrisat
 * routes it reads (MDRS-223). nazir offers these pages to the medrese's
 * başmüderris alone (`apps/nazir/features/shell/abilities.ts`), because every
 * one of them reads a route the matrix opens only to the row the role resolver
 * gives the başmüderris (`resolveMadrasahRole` → MADRASAH_NAZIR, from a
 * MEDRESE_BASMUDERRIS assignment). A medrese nazırı resolves to PUBLIC there.
 *
 * Two halves pin it, because nazir cannot import the matrix (`platform:web`
 * may not depend on `platform:node`):
 *   - this spec: each route carries the scope the table names, the
 *     başmüderris's row holds it, and PUBLIC's does not;
 *   - `apps/nazir/test/abilities.spec.ts`: nazir offers the pages to the
 *     başmüderris and to nobody else.
 * A route that opens to a medrese nazırı (role model v2, MDRS-135) breaks the
 * PUBLIC assertion here, which is the signal to widen the menu there.
 *
 * İtirazlar and Kabul kuralları are placeholders that read nothing yet; they
 * follow the rest of the medrese's pages until they do.
 */
interface PageRoute {
  controller: { prototype: object };
  handler: string;
  scope: Scope;
}
interface MenuPage {
  page: string;
  routes: PageRoute[];
}

const route = (
  controller: { prototype: object },
  handler: string,
  scope: Scope = SCOPES.MANAGE_MADRASAH
): PageRoute => ({ controller, handler, scope });

const NAZIR_MEDRESE_PAGES: MenuPage[] = [
  {
    page: "Pano",
    routes: [route(MadrasahPortalController, "dashboard")],
  },
  {
    page: "Dersler",
    routes: [
      route(MadrasahController, "findCourses"),
      route(MadrasahCourseController, "hostingKosks"),
    ],
  },
  {
    page: "Talebeler",
    routes: [
      route(MadrasahPortalController, "students"),
      route(MadrasahController, "findCourses"),
    ],
  },
  {
    page: "Medrese nazırları",
    routes: [
      route(MadrasahNazirController, "list"),
      route(MadrasahPermissionController, "groups"),
    ],
  },
  {
    page: "Yasaklamalar",
    routes: [
      route(MadrasahBanController, "list"),
      route(MadrasahController, "findCourses"),
    ],
  },
  {
    page: "Arşiv",
    routes: [route(MadrasahArchiveController, "list")],
  },
  {
    page: "Medrese ayarları",
    routes: [
      route(MadrasahController, "getSettings"),
      route(MadrasahController, "findCourses"),
    ],
  },
];

const authzOf = (r: PageRoute): AuthzMeta | undefined => {
  const handler = (r.controller.prototype as Record<string, unknown>)[
    r.handler
  ];
  if (typeof handler !== "function") throw new Error(`No handler ${r.handler}`);
  return Reflect.getMetadata(AUTHZ_KEY, handler) as AuthzMeta | undefined;
};

const rows = (role: Role) => MATRIX[ENTITIES.MADRASAH][role] ?? [];

const each = NAZIR_MEDRESE_PAGES.flatMap((p) =>
  p.routes.map((r) => [p.page, r.handler, r] as const)
);

describe("nazir medrese menu ↔ the matrix (MDRS-223)", () => {
  it.each(each)("%s → %s carries the scope the table names", (_page, _h, r) => {
    expect(authzOf(r)?.scope).toBe(r.scope);
  });

  it.each(each)("%s → %s is open to the başmüderris's row", (_page, _h, r) => {
    expect(rows(ROLES.MADRASAH_NAZIR)).toContain(r.scope);
  });

  it.each(
    each
  )("%s → %s is closed to PUBLIC, where a medrese nazırı lands", (_page, _h, r) => {
    expect(rows(ROLES.PUBLIC)).not.toContain(r.scope);
  });
});
