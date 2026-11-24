/**
 * A course's glossary (lügat): what a term is and what the dialog checks
 * before it sends one. The search and the order of the list are
 * `@medaris/utils`'s `findTerms`, the same the talebe's page uses. Pure.
 */

export const TERM_MAX = 120;
export const TERM_ARABIC_MAX = 200;
export const TERM_MEANING_MAX = 2000;
export const TERM_EXAMPLE_MAX = 1000;

export interface TermFact {
  id: string;
  term: string;
  arabic: string | null;
  lexicalMeaning: string | null;
  technicalMeaning: string | null;
  example: string | null;
}

export interface TermDraft {
  term: string;
  arabic: string;
  lexicalMeaning: string;
  technicalMeaning: string;
  example: string;
}

export const newTermDraft = (): TermDraft => ({
  term: "",
  arabic: "",
  lexicalMeaning: "",
  technicalMeaning: "",
  example: "",
});

export const termDraftOf = (term: TermFact): TermDraft => ({
  term: term.term,
  arabic: term.arabic ?? "",
  lexicalMeaning: term.lexicalMeaning ?? "",
  technicalMeaning: term.technicalMeaning ?? "",
  example: term.example ?? "",
});

export type TermField = keyof TermDraft;
export type TermProblem = "required" | "length";

const LIMITS: Record<TermField, number> = {
  term: TERM_MAX,
  arabic: TERM_ARABIC_MAX,
  lexicalMeaning: TERM_MEANING_MAX,
  technicalMeaning: TERM_MEANING_MAX,
  example: TERM_EXAMPLE_MAX,
};

export const termLimit = (field: TermField): number => LIMITS[field];

/** What the API would refuse, field by field; only the term is required. */
export function termProblems(
  draft: TermDraft
): Partial<Record<TermField, TermProblem>> {
  const problems: Partial<Record<TermField, TermProblem>> = {};
  if (draft.term.trim() === "") problems.term = "required";
  for (const field of Object.keys(LIMITS) as TermField[]) {
    if (draft[field].trim().length > LIMITS[field]) problems[field] = "length";
  }
  return problems;
}

/** The body of a create or an edit: an empty text is sent as null (cleared). */
export function termBody(draft: TermDraft) {
  const text = (value: string) => {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  };
  return {
    term: draft.term.trim(),
    arabic: text(draft.arabic),
    lexicalMeaning: text(draft.lexicalMeaning),
    technicalMeaning: text(draft.technicalMeaning),
    example: text(draft.example),
  };
}
