/** The weeks and sessions a course shows, by id (hidden ones left out). */
export interface IShownSyllabus {
  weekIds: readonly string[];
  lessonIds: readonly string[];
}

interface ISavedWeek {
  id?: string;
  lessons?: readonly { id?: string }[];
}

/**
 * What a whole-course save would hide (MDRS-136). `CourseRepository.replace`
 * hides a week or a session that is missing from the payload; an id the
 * payload carries is kept wherever it sits, because a session may move to
 * another week.
 */
export const hiddenBySave = (
  shown: IShownSyllabus,
  saved: readonly ISavedWeek[]
): { weeks: number; sessions: number } => {
  const keptWeeks = new Set(saved.map((w) => w.id).filter(Boolean));
  const keptLessons = new Set(
    saved.flatMap((w) => (w.lessons ?? []).map((l) => l.id)).filter(Boolean)
  );
  return {
    weeks: shown.weekIds.filter((id) => !keptWeeks.has(id)).length,
    sessions: shown.lessonIds.filter((id) => !keptLessons.has(id)).length,
  };
};
