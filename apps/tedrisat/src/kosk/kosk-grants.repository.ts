import { Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { planGrants } from "../assignment/admin/grant-plan";
import { assertNothingLeftUnder } from "../assignment/admin/orphaned-grants";
import { grantHeld } from "../assignment/assignment.repository";
import type { Tx } from "../course/course-purge";
import { DatabaseService } from "../database/database.service";
import { isHeld } from "../database/role-assignments";
import { auditLog } from "../database/schema/audit.schema";
import { courses } from "../database/schema/course.schema";
import { madrasahs } from "../database/schema/madrasah.schema";
import { permissionGrants } from "../database/schema/permission.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
  SCOPE_TYPES,
  type ScopeType,
} from "../database/schema/role-assignment.schema";
import { users } from "../database/schema/user.schema";
import {
  CourseNazirExistsError,
  CourseNazirNotFoundError,
  GrantCourseInvalidError,
} from "./errors/kosk-grants-errors";

const NAZIR = ASSIGNED_ROLES.DERS_NAZIR;

export interface IGrantCourseRow {
  id: string;
  title: string;
  madrasahName: string | null;
}

export interface IGrantPostRow {
  id: string;
  userId: string;
  courseId: string;
  grantedBy: string;
  grantedAt: Date;
  endsAt: Date | null;
}

export interface IGrantPersonRow {
  id: string;
  givenName: string | null;
  familyName: string | null;
  email: string | null;
}

/** Reads and writes behind the köşk's İzinler page (MDRS-172, nizam/38). */
@Injectable()
export class KoskGrantsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /** The köşk's courses that are not hidden, with the medrese each belongs to. */
  async courseRows(koskId: string): Promise<IGrantCourseRow[]> {
    return this.db
      .select({
        id: courses.id,
        title: courses.title,
        madrasahName: madrasahs.name,
      })
      .from(courses)
      .leftJoin(madrasahs, eq(madrasahs.id, courses.madrasahId))
      .where(and(eq(courses.koskId, koskId), isNull(courses.archivedAt)))
      .orderBy(asc(courses.title), asc(courses.id));
  }

  /** The ders nazırı posts held in the courses, oldest first. */
  async heldPosts(courseIds: string[]): Promise<IGrantPostRow[]> {
    if (courseIds.length === 0) return [];
    const rows = await this.db
      .select({
        id: roleAssignments.id,
        userId: roleAssignments.userId,
        courseId: roleAssignments.scopeId,
        grantedBy: roleAssignments.grantedBy,
        grantedAt: roleAssignments.createdAt,
        endsAt: roleAssignments.expiresAt,
      })
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.role, NAZIR),
          inArray(roleAssignments.scopeId, courseIds),
          isHeld()
        )
      )
      .orderBy(asc(roleAssignments.createdAt), asc(roleAssignments.id));
    return rows.flatMap((r) =>
      r.courseId === null ? [] : [{ ...r, courseId: r.courseId }]
    );
  }

  /** The single permissions each person holds in each course, keyed `user:course`. */
  async heldCodes(
    userIds: string[],
    courseIds: string[]
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (userIds.length === 0 || courseIds.length === 0) return result;
    const rows = await this.db
      .select({
        userId: permissionGrants.userId,
        courseId: permissionGrants.scopeId,
        permission: permissionGrants.permission,
      })
      .from(permissionGrants)
      .where(
        and(
          inArray(permissionGrants.userId, userIds),
          eq(permissionGrants.scopeType, SCOPE_TYPES.COURSE),
          inArray(permissionGrants.scopeId, courseIds),
          grantHeld()
        )
      )
      .orderBy(asc(permissionGrants.createdAt), asc(permissionGrants.id));
    for (const row of rows) {
      if (row.permission === null || row.courseId === null) continue;
      const key = `${row.userId}:${row.courseId}`;
      const list = result.get(key) ?? [];
      if (!list.includes(row.permission)) list.push(row.permission);
      result.set(key, list);
    }
    return result;
  }

  /** What the caller holds in the köşk by grant: the extras beyond their role's defaults. */
  async heldCodesInKosk(userId: string, koskId: string): Promise<string[]> {
    const rows = await this.db
      .select({ permission: permissionGrants.permission })
      .from(permissionGrants)
      .where(
        and(
          eq(permissionGrants.userId, userId),
          eq(permissionGrants.scopeType, SCOPE_TYPES.KOSK),
          eq(permissionGrants.scopeId, koskId),
          grantHeld()
        )
      );
    return rows.flatMap((r) => (r.permission ? [r.permission] : []));
  }

  /** Whether the user holds a köşk nazımı post in the köşk now. */
  async isKoskNazim(userId: string, koskId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: roleAssignments.id })
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.userId, userId),
          eq(roleAssignments.role, ASSIGNED_ROLES.KOSK_NAZIM),
          eq(roleAssignments.scopeId, koskId),
          isHeld()
        )
      )
      .limit(1);
    return rows.length > 0;
  }

  async people(ids: string[]): Promise<Map<string, IGrantPersonRow>> {
    const result = new Map<string, IGrantPersonRow>();
    const wanted = [...new Set(ids)];
    if (wanted.length === 0) return result;
    const rows = await this.db
      .select({
        id: users.id,
        givenName: users.givenName,
        familyName: users.familyName,
        email: users.email,
      })
      .from(users)
      .where(inArray(users.id, wanted));
    for (const row of rows) result.set(row.id, row);
    return result;
  }

  /**
   * Who holds the post, if it is a held post in one of this köşk's
   * medrese-free courses. A post never changes hands, so the answer stands
   * for the write that follows.
   */
  async postHolder(koskId: string, postId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ userId: roleAssignments.userId })
      .from(roleAssignments)
      .innerJoin(courses, eq(courses.id, roleAssignments.scopeId))
      .where(
        and(
          eq(roleAssignments.id, postId),
          eq(roleAssignments.role, NAZIR),
          eq(courses.koskId, koskId),
          isNull(courses.madrasahId),
          isHeld()
        )
      )
      .limit(1);
    return row?.userId ?? null;
  }

  /**
   * The held post, if it is in one of this köşk's medrese-free courses. A
   * medrese course's posts are its own staff's (MDRS-270, d-1001-35): this
   * page never lists them, and it cannot reach them by id either.
   */
  private async lockPost(
    tx: Tx,
    koskId: string,
    postId: string
  ): Promise<{
    id: string;
    userId: string;
    courseId: string;
    expiresAt: Date | null;
  }> {
    const [row] = await tx
      .select({
        id: roleAssignments.id,
        userId: roleAssignments.userId,
        courseId: roleAssignments.scopeId,
        expiresAt: roleAssignments.expiresAt,
      })
      .from(roleAssignments)
      .innerJoin(courses, eq(courses.id, roleAssignments.scopeId))
      .where(
        and(
          eq(roleAssignments.id, postId),
          eq(roleAssignments.role, NAZIR),
          eq(courses.koskId, koskId),
          isNull(courses.madrasahId),
          isHeld()
        )
      )
      .for("update", { of: roleAssignments })
      .limit(1);
    if (!row || row.courseId === null) {
      throw new CourseNazirNotFoundError(postId);
    }
    return { ...row, courseId: row.courseId };
  }

  private heldCourseGrants(tx: Tx, userId: string, courseId: string) {
    return tx
      .select({
        id: permissionGrants.id,
        permission: permissionGrants.permission,
        groupId: permissionGrants.groupId,
        expiresAt: permissionGrants.expiresAt,
      })
      .from(permissionGrants)
      .where(
        and(
          eq(permissionGrants.userId, userId),
          eq(permissionGrants.scopeType, SCOPE_TYPES.COURSE),
          eq(permissionGrants.scopeId, courseId),
          grantHeld()
        )
      )
      .orderBy(asc(permissionGrants.createdAt), asc(permissionGrants.id));
  }

  /**
   * Makes the person the course's ders nazırı and gives them their
   * permissions, in one transaction with the audit row. The post and the
   * permissions end together.
   */
  async assign(
    actorId: string,
    koskId: string,
    input: {
      userId: string;
      courseId: string;
      permissions: string[];
      endsAt: Date | null;
      /** The level the giver acts under: the köşk, or the platform for the başnazım. */
      authority: ScopeType;
    }
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [course] = await tx
        .select({ id: courses.id })
        .from(courses)
        .where(
          and(
            eq(courses.id, input.courseId),
            eq(courses.koskId, koskId),
            isNull(courses.madrasahId),
            isNull(courses.archivedAt)
          )
        )
        .for("no key update")
        .limit(1);
      if (!course) throw new GrantCourseInvalidError(input.courseId);

      const seat = and(
        eq(roleAssignments.userId, input.userId),
        eq(roleAssignments.role, NAZIR),
        eq(roleAssignments.scopeId, input.courseId),
        isHeld()
      );
      const [exists] = await tx
        .select({ id: roleAssignments.id })
        .from(roleAssignments)
        .where(seat)
        .limit(1);
      if (exists) {
        throw new CourseNazirExistsError(input.userId, input.courseId);
      }
      // A post that lapsed but was never revoked would hold the unique index.
      await tx
        .update(roleAssignments)
        .set({ revokedAt: sql`now()`, revokedBy: actorId })
        .where(
          and(
            eq(roleAssignments.userId, input.userId),
            eq(roleAssignments.role, NAZIR),
            eq(roleAssignments.scopeId, input.courseId),
            isNull(roleAssignments.revokedAt)
          )
        );
      const [post] = await tx
        .insert(roleAssignments)
        .values({
          userId: input.userId,
          role: NAZIR,
          scopeType: SCOPE_TYPES.COURSE,
          scopeId: input.courseId,
          grantedBy: actorId,
          expiresAt: input.endsAt,
        })
        .returning({ id: roleAssignments.id });
      await tx.insert(permissionGrants).values(
        input.permissions.map((permission) => ({
          userId: input.userId,
          scopeType: SCOPE_TYPES.COURSE,
          scopeId: input.courseId,
          permission,
          groupId: null,
          grantedBy: actorId,
          authorityScopeType: input.authority,
          expiresAt: input.endsAt,
        }))
      );
      await tx.insert(auditLog).values({
        actorId,
        action: "course_nazir.assign",
        entity: "course",
        entityId: input.courseId,
        details: {
          postId: post.id,
          userId: input.userId,
          permissions: input.permissions,
          endsAt: input.endsAt?.toISOString() ?? null,
        },
      });
    });
  }

  /**
   * Sets the whole set of permissions and the end of a post (nizam/38's
   * "İzinleri düzenle"): what stays keeps its giver and its date, the rest is
   * revoked or added. The post ends with the permissions.
   */
  async update(
    actorId: string,
    koskId: string,
    postId: string,
    wanted: {
      permissions: string[];
      endsAt: Date | null;
      authority: ScopeType;
    }
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const post = await this.lockPost(tx, koskId, postId);
      const held = await this.heldCourseGrants(tx, post.userId, post.courseId);
      const plan = planGrants(held, {
        groupId: null,
        permissions: wanted.permissions,
        expiresAt: wanted.endsAt,
      });
      if (plan.revoke.length > 0) {
        await tx
          .update(permissionGrants)
          .set({ revokedAt: sql`now()`, revokedBy: actorId })
          .where(inArray(permissionGrants.id, plan.revoke));
      }
      if (plan.retime.length > 0) {
        await tx
          .update(permissionGrants)
          .set({ expiresAt: wanted.endsAt })
          .where(inArray(permissionGrants.id, plan.retime));
      }
      if (plan.insert.length > 0) {
        await tx.insert(permissionGrants).values(
          plan.insert.flatMap((item) =>
            "permission" in item
              ? [
                  {
                    userId: post.userId,
                    scopeType: SCOPE_TYPES.COURSE,
                    scopeId: post.courseId,
                    permission: item.permission,
                    groupId: null,
                    grantedBy: actorId,
                    authorityScopeType: wanted.authority,
                    expiresAt: wanted.endsAt,
                  },
                ]
              : []
          )
        );
      }
      await tx
        .update(roleAssignments)
        .set({ expiresAt: wanted.endsAt })
        .where(eq(roleAssignments.id, post.id));
      await tx.insert(auditLog).values({
        actorId,
        action: "course_nazir.update",
        entity: "course",
        entityId: post.courseId,
        details: {
          postId: post.id,
          userId: post.userId,
          permissions: wanted.permissions,
          endsAt: wanted.endsAt?.toISOString() ?? null,
        },
      });
    });
  }

  /**
   * "Görevden al": the post and every permission held in the course end
   * together. Refused, with nothing written, while someone the holder
   * appointed from the course (MDRS-270) still holds their post, as on the
   * course's own route.
   */
  async revoke(actorId: string, koskId: string, postId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const post = await this.lockPost(tx, koskId, postId);
      await tx
        .update(permissionGrants)
        .set({ revokedAt: sql`now()`, revokedBy: actorId })
        .where(
          and(
            eq(permissionGrants.userId, post.userId),
            eq(permissionGrants.scopeType, SCOPE_TYPES.COURSE),
            eq(permissionGrants.scopeId, post.courseId),
            isNull(permissionGrants.revokedAt)
          )
        );
      await tx
        .update(roleAssignments)
        .set({ revokedAt: sql`now()`, revokedBy: actorId })
        .where(eq(roleAssignments.id, post.id));
      await assertNothingLeftUnder(tx, [
        {
          userId: post.userId,
          scopeType: SCOPE_TYPES.COURSE,
          scopeId: post.courseId,
        },
      ]);
      await tx.insert(auditLog).values({
        actorId,
        action: "course_nazir.revoke",
        entity: "course",
        entityId: post.courseId,
        details: { postId: post.id, userId: post.userId },
      });
    });
  }
}
