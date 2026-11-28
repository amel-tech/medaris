import { Injectable } from "@nestjs/common";
import { and, asc, count, eq } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { courseTerms } from "../database/schema/course-term.schema";

export interface ICourseTerm {
  id: string;
  courseId: string;
  term: string;
  arabic: string | null;
  lexicalMeaning: string | null;
  technicalMeaning: string | null;
  example: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICourseTermValues {
  term: string;
  arabic: string | null;
  lexicalMeaning: string | null;
  technicalMeaning: string | null;
  example: string | null;
}

const columns = {
  id: courseTerms.id,
  courseId: courseTerms.courseId,
  term: courseTerms.term,
  arabic: courseTerms.arabic,
  lexicalMeaning: courseTerms.lexicalMeaning,
  technicalMeaning: courseTerms.technicalMeaning,
  example: courseTerms.example,
  createdAt: courseTerms.createdAt,
  updatedAt: courseTerms.updatedAt,
};

@Injectable()
export class CourseTermRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /**
   * In the order they were added: the reader sorts by the term in its own
   * language's alphabet, which the database's collation does not know.
   */
  findByCourse(courseId: string): Promise<ICourseTerm[]> {
    return this.db
      .select(columns)
      .from(courseTerms)
      .where(eq(courseTerms.courseId, courseId))
      .orderBy(asc(courseTerms.createdAt), asc(courseTerms.id));
  }

  async countByCourse(courseId: string): Promise<number> {
    const [row] = await this.db
      .select({ terms: count() })
      .from(courseTerms)
      .where(eq(courseTerms.courseId, courseId));
    return row?.terms ?? 0;
  }

  async insert(
    courseId: string,
    userId: string,
    values: ICourseTermValues
  ): Promise<ICourseTerm> {
    const [row] = await this.db
      .insert(courseTerms)
      .values({ courseId, createdBy: userId, ...values })
      .returning(columns);
    return row;
  }

  /** Only the keys given change; null when the course has no such term. */
  async update(
    courseId: string,
    termId: string,
    changes: Partial<ICourseTermValues>
  ): Promise<ICourseTerm | null> {
    const own = and(
      eq(courseTerms.id, termId),
      eq(courseTerms.courseId, courseId)
    );
    const set = Object.fromEntries(
      Object.entries(changes).filter(([, value]) => value !== undefined)
    ) as Partial<ICourseTermValues>;
    if (Object.keys(set).length === 0) {
      const [row] = await this.db
        .select(columns)
        .from(courseTerms)
        .where(own)
        .limit(1);
      return row ?? null;
    }
    const [row] = await this.db
      .update(courseTerms)
      .set({ ...set, updatedAt: new Date() })
      .where(own)
      .returning(columns);
    return row ?? null;
  }

  async remove(courseId: string, termId: string): Promise<boolean> {
    const rows = await this.db
      .delete(courseTerms)
      .where(
        and(eq(courseTerms.id, termId), eq(courseTerms.courseId, courseId))
      )
      .returning({ id: courseTerms.id });
    return rows.length > 0;
  }
}
