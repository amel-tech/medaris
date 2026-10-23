import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * What the course-deck spec puts in tedrisat's database on top of a course-page
 * fixture: one published deck in each of the course's first three weeks, under
 * random ids, and removes them again. Direct SQL, like the other seeds: no
 * endpoint links a deck to a week of a course. The decks carry no cards, so
 * every row reads "Başla" and the featured one shows 0 of 0 mastered.
 */
export interface CourseDecksFixture {
  deckIds: string[];
  titles: string[];
  remove: () => Promise<void>;
}

export async function seedCourseDecks(
  courseId: string
): Promise<CourseDecksFixture> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) {
    throw new Error(
      "E2E_DATABASE_URL is not set: point it at the database tedrisat uses."
    );
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const author = randomUUID();
  const tag = randomUUID().slice(0, 8);
  const weeks = await client.query<{ id: string; week_number: number }>(
    "select id, week_number from course_weeks where course_id = $1 order by week_number limit 3",
    [courseId]
  );
  const deckIds: string[] = [];
  const titles: string[] = [];
  for (const week of weeks.rows) {
    const id = randomUUID();
    const title = `Ders destesi ${week.week_number}. hafta ${tag}`;
    await client.query(
      `insert into decks(id, author_id, title, description, is_public, publish_status, card_type, course_id, week_id)
       values ($1, $2, $3, null, false, 'PRIVATE', 'VOCABULARY', $4, $5)`,
      [id, author, title, courseId, week.id]
    );
    deckIds.push(id);
    titles.push(title);
  }
  return {
    deckIds,
    titles,
    remove: async () => {
      try {
        await client.query("delete from decks where id = any($1)", [deckIds]);
      } finally {
        await client.end();
      }
    },
  };
}
