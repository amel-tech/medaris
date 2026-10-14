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
import {
  ProfileGender,
  userProfiles,
} from "../database/schema/user-profile.schema";

export type IUserProfile = InferSelectModel<typeof userProfiles>;
export type IUserProfilePatch = Partial<
  Omit<InferInsertModel<typeof userProfiles>, "userId" | "createdAt">
>;

/** The audit action of a mirrored gender that overwrote another (#317). */
export const GENDER_CHANGE_ACTION = "user.gender_change";

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
   * Makes `user_profiles.gender` say what the account says (#317), in one
   * statement: Keycloak is the one source of a person's gender, and this
   * column is the copy that everyone else's view of them (the public profile,
   * course rosters, quotas) reads.
   *
   * - Equal already: nothing is written (the `where` of the conflict clause).
   * - No row, or a row without a gender: the row is created or filled. Not
   *   audited: nothing was overwritten, and the rollout of #317 fills one row
   *   per person, which would bury the audit page.
   * - Another gender stored: overwritten, and `user.gender_change` goes to
   *   the audit log in the same statement, from and to.
   *
   * Two requests racing on one person cannot both write or both audit: the
   * second waits for the first's row lock and then finds the value equal.
   * Returns whether the row changed.
   */
  async mirrorGender(userId: string, gender: ProfileGender): Promise<boolean> {
    const result = await this.db.execute<{ written: boolean }>(sql`
      with previous as (
        select gender from user_profiles where user_id = ${userId}
      ),
      written as (
        insert into user_profiles (user_id, gender)
        values (${userId}, ${gender})
        on conflict (user_id) do update
          set gender = excluded.gender, updated_at = now()
          where user_profiles.gender is distinct from excluded.gender
        returning user_id
      ),
      audited as (
        insert into audit_log (actor_id, action, entity, entity_id, details)
        select ${userId}::uuid, ${GENDER_CHANGE_ACTION}, 'user', ${userId}::uuid,
               jsonb_build_object('from', previous.gender, 'to', ${gender}::text, 'source', 'account')
          from written, previous
         where previous.gender is not null
        returning id
      )
      select exists (select 1 from written) as written`);
    return result.rows[0]?.written === true;
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
