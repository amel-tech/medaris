import { inArray } from "drizzle-orm";
import type { DatabaseService } from "../database/database.service";
import { lessonExams } from "../database/schema/lesson-exam.schema";
import type { Tx } from "./course-purge";
import type { ILessonExam } from "./domain/exam";

type Db = DatabaseService["db"] | Tx;

/** An exam row as the course detail and the session page carry it (MDRS-248). */
export const lessonExamOf = (
  row: typeof lessonExams.$inferSelect
): ILessonExam => ({
  format: row.format,
  maxScore: row.maxScore,
  topics: row.topics,
  location: row.location,
  isRetake: row.isRetake,
  resultsReleasedAt: row.resultsReleasedAt,
});

/** Which of the given lessons are exams, by lesson id; one query. */
export async function findLessonExams(
  db: Db,
  lessonIds: readonly string[]
): Promise<Map<string, ILessonExam>> {
  const found = new Map<string, ILessonExam>();
  if (lessonIds.length === 0) return found;
  const rows = await db
    .select()
    .from(lessonExams)
    .where(inArray(lessonExams.lessonId, [...lessonIds]));
  for (const row of rows) found.set(row.lessonId, lessonExamOf(row));
  return found;
}
