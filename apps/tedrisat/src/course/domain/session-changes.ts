/**
 * What a whole-course save does to the course's sessions, compared with what
 * is stored. Adding, moving and hiding a session are `session.manage` on the
 * lesson routes, so a save that does any of them needs it too; a save that
 * only edits the course, its weeks' titles and the content of the sessions it
 * already has is `course.edit` alone.
 *
 * The matching is the repository's: a payload lesson is the stored one only
 * when it carries the id of a live lesson of the course that no earlier
 * payload lesson has claimed, and a payload week is the stored one only when it
 * carries the id of a live week and is the first to do so. Anything else is
 * written as new. A cancellation is not part of a save, so it is not compared.
 */

export interface IStoredWeek {
  id: string;
  lessons: { id: string; scheduledAt: Date | null }[];
}

export interface IPayloadWeek {
  id?: string;
  lessons?: { id?: string; scheduledAt?: Date | null }[];
}

export interface ISessionChanges {
  /** Lessons the save inserts. */
  added: number;
  /** Lessons that change week, place within the week, or time. */
  moved: number;
  /** Stored lessons the save leaves out, which hides them. */
  hidden: number;
}

const sameInstant = (a: Date | null, b: Date | null): boolean =>
  a === b || (a !== null && b !== null && a.getTime() === b.getTime());

export function sessionChanges(
  stored: readonly IStoredWeek[],
  payload: readonly IPayloadWeek[]
): ISessionChanges {
  const placeOf = new Map<
    string,
    { weekId: string; position: number; scheduledAt: Date | null }
  >();
  for (const week of stored) {
    for (const [position, lesson] of week.lessons.entries()) {
      placeOf.set(lesson.id, {
        weekId: week.id,
        position,
        scheduledAt: lesson.scheduledAt,
      });
    }
  }
  const storedWeekIds = new Set(stored.map((week) => week.id));
  const claimedWeeks = new Set<string>();
  const unclaimed = new Set(placeOf.keys());
  const changes: ISessionChanges = { added: 0, moved: 0, hidden: 0 };

  for (const week of payload) {
    const keptWeekId =
      week.id && storedWeekIds.has(week.id) && !claimedWeeks.has(week.id)
        ? week.id
        : null;
    if (keptWeekId) claimedWeeks.add(keptWeekId);

    for (const [position, lesson] of (week.lessons ?? []).entries()) {
      if (!lesson.id || !unclaimed.delete(lesson.id)) {
        changes.added += 1;
        continue;
      }
      const was = placeOf.get(lesson.id);
      if (!was) continue;
      // `scheduledAt` left out of a save keeps the stored time; `null` clears it.
      const retimed =
        lesson.scheduledAt !== undefined &&
        !sameInstant(lesson.scheduledAt, was.scheduledAt);
      if (was.weekId !== keptWeekId || was.position !== position || retimed) {
        changes.moved += 1;
      }
    }
  }
  changes.hidden = unclaimed.size;
  return changes;
}

/** Whether the save touches the sessions at all. */
export const changesSessions = (changes: ISessionChanges): boolean =>
  changes.added + changes.moved + changes.hidden > 0;
