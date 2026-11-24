/**
 * What the sîga drafts of a deck must pass before they are saved. The sîgas
 * themselves come from `@medaris/sarf`, the engine nazar-web and tedris-web
 * share; this is only the rule that belongs to a deck's card.
 */

import type { SigaDraft } from "@medaris/sarf";
import { FACE_MAX, FACE_MIN } from "./decks";

/**
 * The drafts the müderris left too short or too long, by index: both faces are
 * 3 to 5000 characters, as on "Kart ekle". An emptied back (no meaning was
 * typed) is one of them.
 */
export function sigaDraftProblems(drafts: readonly SigaDraft[]): number[] {
  const bad = (face: string) => {
    const length = face.trim().length;
    return length < FACE_MIN || length > FACE_MAX;
  };
  return drafts.flatMap((draft, i) =>
    bad(draft.contentFront) || bad(draft.contentBack) ? [i] : []
  );
}
