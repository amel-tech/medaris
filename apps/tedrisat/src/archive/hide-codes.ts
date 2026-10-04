import {
  ENTITIES,
  PERMISSIONS,
  type PermissionCode,
  type ResourceRef,
} from "@medaris/common";
import { SCOPE_TYPES } from "../database/schema/scope-type.schema";
import type { ArchiveItemType } from "./archive-types";
import type { IHideStep } from "./hide-level";

const P = PERMISSIONS;

/**
 * What hiding and restoring ask of the catalogue (MDRS-143), in one table, the
 * shape `ban/ban-codes.ts` gave the bans.
 *
 * A ladder lists, per level, the codes that mean "I act at this level here";
 * `actingLevel` takes the highest rung the caller holds, and the kademe
 * (`hide-level.ts`) then decides who may bring back what. Who may HIDE is the
 * route's `@Authz`; the same codes are what a RESTORE asks, so whoever hid
 * something can bring it back and nobody is given a way to hide that they
 * cannot undo.
 *
 * - **A course**: its köşk's nazımı (`course.hide`), its medrese's başmüderris
 *   (`madrasah.course_hide`). No platform code hides a course, so the platform
 *   rung is the başnazım alone, who `actingLevel` always answers as the
 *   platform.
 * - **A week or a session**: whoever holds `week.hide` on the course, and the
 *   two levels above. A session may also be hidden with `session.manage`
 *   (`DELETE /lessons/:id`), so the same code brings it back.
 * - **A köşk, a medrese**: the platform's code and the köşk's or medrese's own.
 */

/** A köşk is hidden and restored with the platform's `platform.kosk_edit` or the köşk's own `kosk.manage`. */
export const KOSK_HIDE_LADDER: readonly IHideStep[] = [
  { level: SCOPE_TYPES.PLATFORM, codes: [P.PLATFORM_KOSK_EDIT] },
  { level: SCOPE_TYPES.KOSK, codes: [P.KOSK_MANAGE] },
];

/** A medrese: `platform.madrasah_edit`, or the başmüderris's `madrasah.hide`. */
export const MADRASAH_HIDE_LADDER: readonly IHideStep[] = [
  { level: SCOPE_TYPES.PLATFORM, codes: [P.PLATFORM_MADRASAH_EDIT] },
  { level: SCOPE_TYPES.MADRASAH, codes: [P.MADRASAH_HIDE] },
];

/** A course: the köşk's nazımı as the köşk, a başmüderris or a nazır given `madrasah.course_hide` as the medrese. */
export const COURSE_HIDE_LADDER: readonly IHideStep[] = [
  { level: SCOPE_TYPES.KOSK, codes: [P.COURSE_HIDE] },
  { level: SCOPE_TYPES.MADRASAH, codes: [P.MADRASAH_COURSE_HIDE] },
];

/** A week: whoever holds `week.hide` acts at the course, under the two levels above it. */
export const WEEK_HIDE_LADDER: readonly IHideStep[] = [
  { level: SCOPE_TYPES.COURSE, codes: [P.WEEK_HIDE] },
  ...COURSE_HIDE_LADDER,
];

/** A session: the week's codes, and `session.manage`, which also hides one. */
export const SESSION_HIDE_LADDER: readonly IHideStep[] = [
  { level: SCOPE_TYPES.COURSE, codes: [P.WEEK_HIDE, P.SESSION_MANAGE] },
  ...COURSE_HIDE_LADDER,
];

/** A deck of a köşk: the köşk's own `kosk.manage` (MDRS-148 owns the rest of decks). */
export const DECK_HIDE_LADDER: readonly IHideStep[] = [
  { level: SCOPE_TYPES.KOSK, codes: [P.KOSK_MANAGE] },
];

/** Where the codes of an archive item are asked, and which ladder reads them. */
export interface IHideTarget {
  /** The resource the engine is asked about: a holding reaches only what is below its scope. */
  resource: ResourceRef;
  ladder: readonly IHideStep[];
  /** Items that share this key share the answer for one caller, so a page asks once. */
  key: string;
}

/**
 * The target of an archived item, or null when nothing but the başnazım
 * restores it (a type with no storage or no catalogue code).
 */
export function hideTargetOf(item: {
  type: ArchiveItemType;
  id: string;
  koskId: string | null;
  courseId: string | null;
}): IHideTarget | null {
  switch (item.type) {
    case "kosk":
      return {
        resource: { entity: ENTITIES.KOSK, id: item.id },
        ladder: KOSK_HIDE_LADDER,
        key: `kosk:${item.id}`,
      };
    case "course":
      return {
        resource: { entity: ENTITIES.COURSE, id: item.id },
        ladder: COURSE_HIDE_LADDER,
        key: `course:${item.id}`,
      };
    case "week":
    case "session": {
      if (item.courseId === null) return null;
      return {
        resource: { entity: ENTITIES.COURSE, id: item.courseId },
        ladder: item.type === "week" ? WEEK_HIDE_LADDER : SESSION_HIDE_LADDER,
        key: `${item.type}-of-course:${item.courseId}`,
      };
    }
    case "deck": {
      if (item.koskId === null) return null;
      return {
        resource: { entity: ENTITIES.KOSK, id: item.koskId },
        ladder: DECK_HIDE_LADDER,
        key: `deck-of-kosk:${item.koskId}`,
      };
    }
    default:
      return null;
  }
}

/** Reading a köşk's archive: whoever may hide and bring back in it. */
export const KOSK_ARCHIVE_READ_CODES: readonly PermissionCode[] = [
  P.KOSK_MANAGE,
  P.PLATFORM_KOSK_EDIT,
];

/**
 * Reading a medrese's archive: everyone who may hide in it or bring something
 * back, and `madrasah.settings_edit`, which opened it before and is not narrowed.
 */
export const MADRASAH_ARCHIVE_READ_CODES: readonly PermissionCode[] = [
  P.MADRASAH_COURSE_HIDE,
  P.MADRASAH_HIDE,
  P.PLATFORM_MADRASAH_EDIT,
  P.MADRASAH_SETTINGS_EDIT,
];

/** Reading one course's archive and hiding its weeks: the course team's `week.hide`. */
export const COURSE_ARCHIVE_READ_CODES: readonly PermissionCode[] = [
  P.WEEK_HIDE,
];
