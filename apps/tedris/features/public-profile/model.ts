/** What Herkese açık profil (design tedris/35, MDRS-166) decides in the browser; kept apart from the components so it can be tested. */

export type Gender = "FEMALE" | "MALE";

export interface Visibility {
  fullName: boolean;
  city: boolean;
  about: boolean;
  courses: boolean;
}

export type HideableField = keyof Visibility;

/** The order the preview names hidden fields in: the form's own order. */
export const HIDEABLE_FIELDS: readonly HideableField[] = [
  "fullName",
  "city",
  "about",
  "courses",
];

/** The fields a stranger cannot see, in form order — the "Gizli: …" line of the preview. */
export function hiddenFields(visibility: Visibility): HideableField[] {
  return HIDEABLE_FIELDS.filter((field) => !visibility[field]);
}

/** "ad ve soyad, şehir, derslerin" from the names of the hidden fields. */
export function hiddenLine(
  visibility: Visibility,
  name: (field: HideableField) => string
): string {
  return hiddenFields(visibility).map(name).join(", ");
}

export type ProfileErrors = { kunye?: "required" };

/** The künye is the one required field (criterion 5): a blank one blocks the save. */
export function validateProfile(kunye: string): ProfileErrors {
  return kunye.trim() ? {} : { kunye: "required" };
}

export interface ProfileDraft {
  kunye: string;
  gender: Gender | null;
  city: string;
  about: string;
}

/** Whether the form differs from what is stored, so "Kaydet" has something to save. */
export function isDirty(draft: ProfileDraft, saved: ProfileDraft): boolean {
  return (
    draft.kunye.trim() !== saved.kunye.trim() ||
    draft.gender !== saved.gender ||
    draft.city.trim() !== saved.city.trim() ||
    draft.about.trim() !== saved.about.trim()
  );
}
