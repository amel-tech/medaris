import { Injectable } from "@nestjs/common";
import {
  and,
  eq,
  InferInsertModel,
  InferSelectModel,
  inArray,
  isNull,
  sql,
} from "drizzle-orm";
import type { Tx } from "../course/course-purge";
import { CourseStatus } from "../course/domain/course-status.enum";
import { EnrollmentStatus } from "../course/domain/enrollment-status.enum";
import { DatabaseService } from "../database/database.service";
import { enrolledCourseIds } from "../database/enrolled-courses";
import { courses } from "../database/schema/course.schema";
import { kosks } from "../database/schema/kosk.schema";
import { userProfiles } from "../database/schema/user-profile.schema";

export type IUserProfile = InferSelectModel<typeof userProfiles>;
export type IUserProfilePatch = Partial<
  Omit<InferInsertModel<typeof userProfiles>, "userId" | "createdAt">
>;

/** Postgres' unique_violation, the only way two people can pick one künye. */
const UNIQUE_VIOLATION = "23505";

export const isUniqueViolation = (error: unknown): boolean => {
  // drizzle wraps the driver error and keeps it as `cause`.
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current; depth++) {
    if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
};

@Injectable()
export class UserProfileRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  async findById(userId: string): Promise<IUserProfile | null> {
    const rows = await this.db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Creates the row on first write; afterwards changes only the fields given.
   * `executor` is the caller's transaction when the write must commit with others.
   */
  async upsert(
    userId: string,
    patch: IUserProfilePatch,
    executor: DatabaseService["db"] | Tx = this.db
  ): Promise<void> {
    await executor
      .insert(userProfiles)
      .values({ userId, ...patch })
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: { ...patch, updatedAt: sql`now()` },
      });
  }

  /**
   * Titles of the published courses `userId` is enrolled in or has completed
   * and may still attend (a barred talebe's drop out, as everywhere else).
   */
  async courseTitles(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ title: courses.title })
      .from(courses)
      .innerJoin(kosks, eq(kosks.id, courses.koskId))
      .where(
        and(
          inArray(
            courses.id,
            enrolledCourseIds(this.db, userId, [
              EnrollmentStatus.ENROLLED,
              EnrollmentStatus.COMPLETED,
            ])
          ),
          eq(courses.status, CourseStatus.PUBLISHED),
          isNull(courses.archivedAt),
          // A course of a hidden köşk is closed with it (MDRS-143).
          isNull(kosks.archivedAt)
        )
      )
      .orderBy(courses.title);
    return rows.map((r) => r.title);
  }
}
