/** The köşk application form (design tedris/37, MDRS-166): what the browser checks before it asks the API. Mirrors `CreateKoskApplicationDto` in tedrisat. */

/** The eleven fields of the design, in its order. `key` is the message key under `KoskApplication.fields`. */
export const APPLICATION_FIELDS = [
  { value: "ARABIC_LANGUAGE_SCIENCES", key: "arabicLanguageSciences" },
  { value: "RHETORIC", key: "rhetoric" },
  { value: "FIQH", key: "fiqh" },
  { value: "USUL_AL_FIQH", key: "usulAlFiqh" },
  { value: "HADITH", key: "hadith" },
  { value: "QURAN_SCIENCES", key: "quranSciences" },
  { value: "TAFSIR", key: "tafsir" },
  { value: "AQEEDAH_KALAM", key: "aqeedahKalam" },
  { value: "SEERAH", key: "seerah" },
  { value: "LOGIC", key: "logic" },
  { value: "OTHER", key: "other" },
] as const;

export type ApplicationFieldValue =
  (typeof APPLICATION_FIELDS)[number]["value"];

export interface ApplicationDraft {
  name: string;
  field: string;
  summary: string;
  reason: string;
  email: string;
  phone: string;
}

export type ApplicationError = "required" | "email" | "phone";
export type ApplicationErrors = Partial<
  Record<keyof ApplicationDraft, ApplicationError>
>;

/** The same shape the API accepts for a phone number: digits with the usual separators. */
export const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{5,18}[0-9]$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Required: name, field, summary, reason, e-mail. Phone is optional but, when given, must look like one. */
export function validateApplication(
  draft: ApplicationDraft
): ApplicationErrors {
  const errors: ApplicationErrors = {};
  if (!draft.name.trim()) errors.name = "required";
  if (!APPLICATION_FIELDS.some((f) => f.value === draft.field)) {
    errors.field = "required";
  }
  if (!draft.summary.trim()) errors.summary = "required";
  if (!draft.reason.trim()) errors.reason = "required";
  const email = draft.email.trim();
  if (!email) errors.email = "required";
  else if (!EMAIL_PATTERN.test(email)) errors.email = "email";
  const phone = draft.phone.trim();
  if (phone && !PHONE_PATTERN.test(phone)) errors.phone = "phone";
  return errors;
}

export const hasErrors = (errors: ApplicationErrors): boolean =>
  Object.keys(errors).length > 0;
