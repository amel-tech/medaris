import type {
  CreateOffsiteCourseRequestDto,
  KoskResponse,
} from "@medaris/services/tedrisat";
import { type TitleProblem, titleProblem } from "~/features/courses/courses";

/**
 * Medrese dışı ders talebi (nazir 09) as rules: which köşks the request may go
 * to, what the form allows and sends, and which refusal says what. Pure on
 * purpose, so that the page and the form have nothing to decide.
 */

/** The longest reason the API takes (trimmed). */
export const REASON_MAX = 2000;

export type ReasonProblem = "required" | "long";

/** The first thing wrong with the reason: blank, or longer than the API takes, as it counts it (trimmed). */
export function reasonProblem(reason: string): ReasonProblem | null {
  const length = reason.trim().length;
  if (length === 0) return "required";
  return length > REASON_MAX ? "long" : null;
}

const collator = new Intl.Collator("tr");

/** The köşks to choose from, by name: the request may go to any köşk the API lists. */
export const koskChoices = (
  kosks: ReadonlyArray<Pick<KoskResponse, "id" | "name">>
): Array<{ id: string; name: string }> =>
  kosks
    .map((kosk) => ({ id: kosk.id, name: kosk.name }))
    .sort((a, b) => collator.compare(a.name, b.name));

export interface OffsiteForm {
  koskId: string | null;
  title: string;
  reason: string;
}

export interface OffsiteProblems {
  kosk: boolean;
  title: TitleProblem | null;
  reason: ReasonProblem | null;
}

/** What keeps the form from being sent; null when it can be. */
export function offsiteProblems(form: OffsiteForm): OffsiteProblems | null {
  const problems: OffsiteProblems = {
    kosk: form.koskId === null,
    title: titleProblem(form.title),
    reason: reasonProblem(form.reason),
  };
  return problems.kosk || problems.title || problems.reason ? problems : null;
}

/** The body of the POST: the name and the reason trimmed. */
export const offsiteRequest = (
  form: OffsiteForm
): CreateOffsiteCourseRequestDto => ({
  koskId: form.koskId as string,
  title: form.title.trim(),
  reason: form.reason.trim(),
});

/** The message key of a refused call, from the code the API answered with. */
export function offsiteErrorKey(code: string): string {
  switch (code) {
    case "KOSK_NOT_FOUND":
      return "Offsite.errors.kosk";
    case "VALIDATION_ERROR":
      return "Offsite.errors.invalid";
    case "AUTHZ_FORBIDDEN":
      return "Problems.actionForbidden";
    default:
      return "Problems.actionGeneric";
  }
}
