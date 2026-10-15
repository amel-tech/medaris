import type { MuderrisResponse } from "@medaris/services/tedrisat";
import {
  formatHocaName,
  HOCA_UNVAN_PREFIX,
  HOCA_UNVANS,
  type HocaUnvan,
  isHocaUnvan,
} from "@medaris/utils";

/**
 * "Hocalar ve unvanları" of Ders ayarları as rules: which hocas the card
 * lists, what each select offers, what Kaydet sends and which sentence a
 * refusal gets. Pure, so the card has nothing to decide. The unvan belongs to
 * the hoca in this course only (owner, 2026-10-15); the name it makes is
 * `formatHocaName` from `@medaris/utils`, the one tedrisat's codes come from.
 */

/** The select has no "empty" value: "none" stands for no unvan, the plain "Hoca". */
export const NO_UNVAN = "none";

/** One hoca of the course as the card shows them. */
export interface HocaRow {
  /** the account; null for a hoca shown by name alone, whose unvan cannot be set */
  userId: string | null;
  name: string;
  /** what the select holds: a code, or `NO_UNVAN` */
  unvan: string;
}

/** The course's hocas, in the order the course lists them, with the unvan each carries in it. */
export function hocaRowsOf(
  muderris: readonly Pick<MuderrisResponse, "userId" | "name" | "unvan">[]
): HocaRow[] {
  return muderris.map((m) => ({
    userId: m.userId ?? null,
    name: m.name,
    unvan: isHocaUnvan(m.unvan) ? m.unvan : NO_UNVAN,
  }));
}

/** What the select's value stands for: a code, or null for no unvan. */
export const unvanOf = (value: string): HocaUnvan | null =>
  isHocaUnvan(value) ? value : null;

/** The name as the course shows it with the unvan the select holds. */
export const shownName = (row: Pick<HocaRow, "name" | "unvan">): string =>
  formatHocaName(row.name, unvanOf(row.unvan));

/**
 * The select's options: the untitled "Hoca" first, worded by the page, then
 * every unvan in the order tedrisat lists them, written as they are put
 * before the name (they are part of the name, the same in every language).
 */
export function unvanOptions(
  untitled: string
): { value: string; label: string }[] {
  return [
    { value: NO_UNVAN, label: untitled },
    ...HOCA_UNVANS.map((code) => ({
      value: code,
      label: HOCA_UNVAN_PREFIX[code],
    })),
  ];
}

/** The hocas whose unvan the draft changes, each once, in list order. Rows with no account never change. */
export function unvanChanges(
  saved: readonly HocaRow[],
  draft: readonly HocaRow[]
): { userId: string; unvan: HocaUnvan | null }[] {
  return draft.flatMap((row) => {
    if (!row.userId) return [];
    const before = saved.find((s) => s.userId === row.userId);
    if (!before || before.unvan === row.unvan) return [];
    return [{ userId: row.userId, unvan: unvanOf(row.unvan) }];
  });
}

/** The message key (from the catalogue's root) of a refused write, from the API's code. */
export function unvanErrorKey(code: string): string {
  switch (code) {
    case "AUTHZ_FORBIDDEN":
      return "Problems.actionForbidden";
    case "COURSE_MUDERRIS_NOT_FOUND":
      return "CourseSettings.hocas.errors.notHoca";
    case "VALIDATION_ERROR":
      return "CourseSettings.errors.invalid";
    default:
      return "CourseSettings.errors.generic";
  }
}
