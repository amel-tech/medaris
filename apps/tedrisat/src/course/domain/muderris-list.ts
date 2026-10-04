import type {
  ICreateMuderris,
  IMuderris,
} from "../course.repository.interface";
import { CourseImamNotListedError } from "../errors/course-imam-not-listed.error";
import { MuderrisListInvalidError } from "../errors/muderris-list-invalid.error";

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

/**
 * The accounts a list is bound to, lowercased, each once, in list order. A
 * row with no account (a name-only legacy row) teaches nobody: the role the
 * course page's müderris holds comes from the account.
 */
export const boundAccountIds = (
  rows: readonly { userId?: string | null }[]
): string[] => [
  ...new Set(
    rows
      .map((row) => row.userId?.toLowerCase())
      .filter((id): id is string => Boolean(id))
  ),
];

/**
 * The accounts the course's team is bound to once `next` is saved. A row that
 * names a stored row by `id` and leaves `userId` out keeps the stored account,
 * because `CourseRepository.replace` does not write a field the payload omits.
 * A `userId: null` is written (Drizzle sets the column to NULL), so it unbinds
 * the row: only `undefined` falls back to the stored account.
 */
export const boundAccountsAfterSave = (
  current: readonly IMuderris[],
  next: readonly ICreateMuderris[]
): string[] =>
  boundAccountIds(
    next.map((row) => ({
      userId:
        row.userId === undefined
          ? current.find((m) => m.id.toLowerCase() === row.id?.toLowerCase())
              ?.userId
          : row.userId,
    }))
  );

/**
 * The imam of a course that is being opened (MDRS-136). A course is opened
 * together with at least one müderris who has an account, and one of them is
 * its imam: the one named, who must be among them, or else the account listed
 * first.
 */
export const imamOfNewCourse = (
  rows: readonly ICreateMuderris[],
  imamUserId?: string
): string => {
  const accounts = boundAccountIds(rows);
  if (accounts.length === 0) {
    throw new MuderrisListInvalidError(
      "A course is opened with at least one müderris who has an account"
    );
  }
  const imam = imamUserId?.toLowerCase();
  if (imam === undefined) return accounts[0];
  if (!accounts.includes(imam)) throw new CourseImamNotListedError(imam);
  return imam;
};
