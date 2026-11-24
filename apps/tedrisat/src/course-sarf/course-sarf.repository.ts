import { Injectable } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { courseSarfRoots } from "../database/schema/course-sarf.schema";

export interface ICourseSarfRoot {
  id: string;
  courseId: string;
  kok: string;
  bab: string;
  mastar: string | null;
  masdarVezin: string;
  createdAt: Date;
  updatedAt: Date;
}

const columns = {
  id: courseSarfRoots.id,
  courseId: courseSarfRoots.courseId,
  kok: courseSarfRoots.kok,
  bab: courseSarfRoots.bab,
  mastar: courseSarfRoots.mastar,
  masdarVezin: courseSarfRoots.masdarVezin,
  createdAt: courseSarfRoots.createdAt,
  updatedAt: courseSarfRoots.updatedAt,
};

@Injectable()
export class CourseSarfRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /** In the order the müderris added them. */
  findByCourse(courseId: string): Promise<ICourseSarfRoot[]> {
    return this.db
      .select(columns)
      .from(courseSarfRoots)
      .where(eq(courseSarfRoots.courseId, courseId))
      .orderBy(asc(courseSarfRoots.createdAt), asc(courseSarfRoots.id));
  }

  /**
   * Adds the root, or, when the course already has this root in this bâb,
   * changes its mastar and its masdar's vezin: one row per root and bâb.
   */
  async save(
    courseId: string,
    userId: string,
    values: {
      kok: string;
      bab: string;
      mastar: string | null;
      masdarVezin: string;
    }
  ): Promise<ICourseSarfRoot> {
    const [row] = await this.db
      .insert(courseSarfRoots)
      .values({ courseId, createdBy: userId, ...values })
      .onConflictDoUpdate({
        target: [
          courseSarfRoots.courseId,
          courseSarfRoots.kok,
          courseSarfRoots.bab,
        ],
        set: {
          mastar: values.mastar,
          masdarVezin: values.masdarVezin,
          updatedAt: new Date(),
        },
      })
      .returning(columns);
    return row;
  }

  async remove(courseId: string, rootId: string): Promise<boolean> {
    const rows = await this.db
      .delete(courseSarfRoots)
      .where(
        and(
          eq(courseSarfRoots.id, rootId),
          eq(courseSarfRoots.courseId, courseId)
        )
      )
      .returning({ id: courseSarfRoots.id });
    return rows.length > 0;
  }
}
