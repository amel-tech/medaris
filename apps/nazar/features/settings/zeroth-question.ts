import type { MadrasahZerothQuestionResponse } from "@medaris/services/tedrisat";

/**
 * A medrese's zeroth question on Medrese ayarları (MDRS-299), as rules: what
 * the form allows and what Kaydet sends, exercised without a server. The
 * limits are the API's (`SaveZerothQuestionDto`).
 */
export const ZEROTH_TEXT_MAX = 1000;
export const ZEROTH_OPTION_MAX = 300;
export const ZEROTH_OPTIONS_MIN = 2;
export const ZEROTH_OPTIONS_MAX = 10;

/** The hadith the question is about, shown fixed above it. */
export const ZEROTH_HADITH = "مَنْ غَشَّنَا فَلَيْسَ مِنَّا";

/** What the form holds: the question as typed and one field per option. */
export interface ZerothDraft {
  text: string;
  options: string[];
}

/** The last save as the page keeps it. */
export interface ZerothSaved extends ZerothDraft {
  updatedAt: string | null;
}

export const zerothOf = (
  answer: MadrasahZerothQuestionResponse
): ZerothSaved => ({
  text: answer.text,
  options: [...answer.options],
  updatedAt: answer.updatedAt ? new Date(answer.updatedAt).toISOString() : null,
});

/** A new medrese's form: no question, two empty options. */
export const formOf = (saved: ZerothSaved): ZerothDraft => ({
  text: saved.text,
  options:
    saved.options.length >= ZEROTH_OPTIONS_MIN
      ? [...saved.options]
      : [...saved.options, "", ""].slice(0, ZEROTH_OPTIONS_MIN),
});

/** What Kaydet sends: the text and the filled options, trimmed. */
export const zerothBody = (draft: ZerothDraft): ZerothDraft => ({
  text: draft.text.trim(),
  options: draft.options.map((o) => o.trim()).filter((o) => o !== ""),
});

export type ZerothProblem =
  | "text"
  | "textLong"
  | "options"
  | "optionLong"
  | "same";

/** The first thing that keeps the form from being sent; null when it can go. */
export function zerothProblem(draft: ZerothDraft): ZerothProblem | null {
  const body = zerothBody(draft);
  if (body.text === "") return "text";
  if (body.text.length > ZEROTH_TEXT_MAX) return "textLong";
  if (body.options.length < ZEROTH_OPTIONS_MIN) return "options";
  if (body.options.some((o) => o.length > ZEROTH_OPTION_MAX))
    return "optionLong";
  if (new Set(body.options).size !== body.options.length) return "same";
  return null;
}

/** Whether Kaydet would change what is saved. */
export const zerothDirty = (
  saved: ZerothDraft,
  draft: ZerothDraft
): boolean => {
  const body = zerothBody(draft);
  return (
    body.text !== saved.text ||
    body.options.length !== saved.options.length ||
    body.options.some((o, i) => o !== saved.options[i])
  );
};
