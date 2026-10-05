import type { CreateKoskDto, UpdateKoskDto } from "@medaris/services/tedrisat";

/**
 * The köşk form's rules (MDRS-108). The limits repeat tedrisat's
 * `apps/tedrisat/src/kosk/dto/kosk-field-rules.ts` so the form refuses what
 * the API would; the API stays the authority and answers 400 either way.
 */
export const KOSK_FORM_LIMITS = {
  nameMin: 2,
  nameMax: 120,
  handleMax: 60,
  descriptionMax: 1000,
  hueMax: 360,
  tagsMax: 10,
  tagMax: 40,
} as const;

export type AddTagResult =
  | { ok: true; tags: string[] }
  | { ok: false; error: "tagsFull" | "tagTooLong" };

/**
 * Adds a typed tag. Blank input and a tag already present (compared without
 * case, as `tr-TR` lower-cases) leave the list as it is rather than failing.
 */
export const addTag = (tags: string[], raw: string): AddTagResult => {
  const tag = raw.trim();
  if (!tag) return { ok: true, tags };
  const key = tag.toLocaleLowerCase("tr-TR");
  if (tags.some((t) => t.toLocaleLowerCase("tr-TR") === key)) {
    return { ok: true, tags };
  }
  if (tag.length > KOSK_FORM_LIMITS.tagMax) {
    return { ok: false, error: "tagTooLong" };
  }
  if (tags.length >= KOSK_FORM_LIMITS.tagsMax) {
    return { ok: false, error: "tagsFull" };
  }
  return { ok: true, tags: [...tags, tag] };
};

/** A hue in 0…360, whole degrees; anything else falls back to the default. */
export const clampHue = (value: number): number =>
  Number.isFinite(value)
    ? Math.min(KOSK_FORM_LIMITS.hueMax, Math.max(0, Math.round(value)))
    : 215;

export interface KoskFormState {
  name: string;
  handle: string;
  description: string;
  tags: string[];
  coverHue: number;
  isPrivate: boolean;
}

/**
 * The request body for the form. On create an empty optional field is left
 * out; on edit it is sent as `null`, which is how the API clears a nullable
 * column — leaving it out would keep the old value, so emptying a field in
 * the form and saving would change nothing.
 */
export function toKoskDto(state: KoskFormState, mode: "create"): CreateKoskDto;
export function toKoskDto(state: KoskFormState, mode: "edit"): UpdateKoskDto;
export function toKoskDto(
  state: KoskFormState,
  mode: "create" | "edit"
): CreateKoskDto | UpdateKoskDto {
  const empty = mode === "edit" ? null : undefined;
  const text = (value: string) => value.trim() || empty;
  return {
    name: state.name.trim(),
    handle: text(state.handle),
    description: text(state.description),
    tags: state.tags,
    coverHue: clampHue(state.coverHue),
    isPrivate: state.isPrivate,
  };
}
