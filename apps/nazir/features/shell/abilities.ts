import type { Scope } from "./scope";

/**
 * Which of a scope's pages the portal offers its holder (MDRS-223): the menu
 * shows a page only to a role tedrisat lets read it, so no menu item ends in
 * "Bu sayfaya izniniz yok". tedrisat checks again on every call; this only
 * decides what is offered.
 *
 * The rule is read from the scope's role, which comes from `GET
 * /me/assignments` (never from a token claim), because that is the source the
 * API's guard reads too: every page under `/medrese/<id>` — Pano, Dersler,
 * Talebeler, Medrese nazırları, Yasaklamalar, Arşiv, Medrese ayarları — reads
 * a route that carries `MANAGE_MADRASAH` on the medrese, and the matrix holds
 * that scope only on the row the role resolver gives the medrese's
 * başmüderris. A medrese nazırı resolves to `PUBLIC` there, so all of them
 * answer 403. Grants (`madrasah.*` permission codes) do not open those routes
 * yet; role model v2 (MDRS-135) is where they will, and these functions are
 * where the portal switches to `GET /me/effective-permissions`.
 *
 * The table behind it is pinned on both sides:
 *   - `apps/tedrisat/test/unit/authz/nazir-medrese-menu.spec.ts`: each route
 *     a medrese page reads carries `MANAGE_MADRASAH`, held by the
 *     başmüderris's row and not by `PUBLIC`;
 *   - `apps/nazir/test/abilities.spec.ts` and `nav.spec.ts`: the menu shows
 *     those pages to the başmüderris alone.
 * Change them together.
 *
 * A course's pages are not narrowed: its sections are placeholders that read
 * nothing from the API yet, so there is no refusal to mirror.
 */

/** The role that heads a medrese, and the only one its pages answer. */
export const MEDRESE_HEAD_ROLE = "MEDRESE_BASMUDERRIS";

/** Whether the caller is this medrese's başmüderris. */
export const headsMedrese = (scope: Pick<Scope, "kind" | "role">): boolean =>
  scope.kind === "medrese" && scope.role === MEDRESE_HEAD_ROLE;

/**
 * Whether the menu offers the pages under a scope (`/medrese/<id>/…`,
 * `/ders/<id>/…`, and the scope's own page): every page of a medrese to its
 * başmüderris, none to anyone else; every page of a course.
 */
export const mayOpenScopePages = (
  scope: Pick<Scope, "kind" | "role">
): boolean => scope.kind === "ders" || headsMedrese(scope);
