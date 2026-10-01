import type {
  ICreateMuderris,
  IMuderris,
} from "../course.repository.interface";

/**
 * The fields a whole-course PUT writes to an existing `course_muderris` row.
 * `CourseRepository.replace` updates a row by id with exactly these, and an
 * `undefined` value is not written (Drizzle leaves the column as it is).
 */
const WRITTEN_FIELDS = [
  "userId",
  "name",
  "title",
  "bio",
  "avatarHue",
] as const satisfies readonly (keyof ICreateMuderris & keyof IMuderris)[];

const normalise = (field: (typeof WRITTEN_FIELDS)[number], value: unknown) =>
  field === "userId" && typeof value === "string" ? value.toLowerCase() : value;

/**
 * Whether saving `next` as a course's müderris list would change who teaches
 * it, or how they are shown (MDRS-105).
 *
 * It answers the question `CourseRepository.replace` would answer by writing:
 * the list is unchanged only when every row is the stored row at the same
 * position, by id, and no field it carries differs from what is stored. A
 * new row (no id, or an id that is not this course's), a dropped row, a
 * reordering or an edited field is a change. A field the payload leaves out
 * is not one, because the replace does not write it.
 *
 * `current` must be in `orderIndex` order, as `findMuderris` returns it.
 */
export const muderrisListChanged = (
  current: readonly IMuderris[],
  next: readonly ICreateMuderris[]
): boolean => {
  if (current.length !== next.length) return true;
  return next.some((row, i) => {
    const stored = current[i];
    if (!row.id || row.id.toLowerCase() !== stored.id.toLowerCase()) {
      return true;
    }
    return WRITTEN_FIELDS.some((field) => {
      const value = row[field];
      if (value === undefined) return false;
      return normalise(field, value) !== normalise(field, stored[field]);
    });
  });
};

/**
 * The accounts `next` links that `current` does not already link, lowercased
 * and de-duplicated — the ones whose existence has to be checked. An account
 * that was linked before this save is not re-checked, so an old row keeps
 * saving even if its link predates the `users` table (MDRS-104).
 */
export const newlyLinkedUserIds = (
  current: readonly IMuderris[],
  next: readonly ICreateMuderris[]
): string[] => {
  const linked = new Set(
    current
      .map((m) => m.userId?.toLowerCase())
      .filter((id): id is string => Boolean(id))
  );
  return [
    ...new Set(
      next
        .map((m) => m.userId?.toLowerCase())
        .filter((id): id is string => Boolean(id) && !linked.has(id as string))
    ),
  ];
};

/** The first account that `next` lists twice, if any. */
export const duplicateUserId = (
  next: readonly ICreateMuderris[]
): string | null => {
  const seen = new Set<string>();
  for (const row of next) {
    const id = row.userId?.toLowerCase();
    if (!id) continue;
    if (seen.has(id)) return id;
    seen.add(id);
  }
  return null;
};
