import { Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { planPostGrants } from "../../assignment/admin/grant-plan";
import { assertNothingLeftUnder } from "../../assignment/admin/orphaned-grants";
import { grantHeld } from "../../assignment/assignment.repository";
import { DatabaseService } from "../../database/database.service";
import { isHeld } from "../../database/role-assignments";
import { auditLog } from "../../database/schema/audit.schema";
import { courses } from "../../database/schema/course.schema";
import { permissionGrants } from "../../database/schema/permission.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
  SCOPE_TYPES,
  type ScopeType,
} from "../../database/schema/role-assignment.schema";
import {
  CourseNazirExistsError,
  CourseNazirNotFoundError,
  GrantCourseInvalidError,
} from "../../kosk/errors/kosk-grants-errors";
import { NazirNotAppointedByYouError } from "../../madrasah/errors/nazir-not-appointed-by-you.error";
import type { Tx } from "../course-purge";
import { CourseNazirHoldsSeatError } from "./course-nazir-errors";

const NAZIR = ASSIGNED_ROLES.DERS_NAZIR;

export interface ICoursePostRow {
  id: string;
  userId: string;
  grantedBy: string;
  grantedAt: Date;
  endsAt: Date | null;
}

const iso = (date: Date | null) => date?.toISOString() ?? null;

/** The ders nazırı posts of one course, as the course's own route sees them (MDRS-270). */
@Injectable()
export class CourseNazirRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /** A held ders nazırı post with that id in this course. */
  private postIn(courseId: string, postId: string) {
    return and(
      eq(roleAssignments.id, postId),
      eq(roleAssignments.role, NAZIR),
      eq(roleAssignments.scopeType, SCOPE_TYPES.COURSE),
      eq(roleAssignments.scopeId, courseId),
      isHeld()
    );
  }

  /** The held ders nazırı posts of the course, oldest first. */
  async heldPosts(courseId: string): Promise<ICoursePostRow[]> {
    return this.db
      .select({
        id: roleAssignments.id,
        userId: roleAssignments.userId,
        grantedBy: roleAssignments.grantedBy,
        grantedAt: roleAssignments.createdAt,
        endsAt: roleAssignments.expiresAt,
      })
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.role, NAZIR),
          eq(roleAssignments.scopeType, SCOPE_TYPES.COURSE),
          eq(roleAssignments.scopeId, courseId),
          isHeld()
        )
      )
      .orderBy(asc(roleAssignments.createdAt), asc(roleAssignments.id));
  }

  /** The single permissions each person holds in the course now, by person. */
  async heldCodes(
    userIds: string[],
    courseId: string
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (userIds.length === 0) return result;
    const rows = await this.db
      .select({
        userId: permissionGrants.userId,
        permission: permissionGrants.permission,
      })
      .from(permissionGrants)
      .where(
        and(
          inArray(permissionGrants.userId, userIds),
          eq(permissionGrants.scopeType, SCOPE_TYPES.COURSE),
          eq(permissionGrants.scopeId, courseId),
          grantHeld()
        )
      )
      .orderBy(asc(permissionGrants.createdAt), asc(permissionGrants.id));
    for (const row of rows) {
      if (row.permission === null) continue;
      const list = result.get(row.userId) ?? [];
      if (!list.includes(row.permission)) list.push(row.permission);
      result.set(row.userId, list);
    }
    return result;
  }

  /**
   * Who holds the post, if it is a held post of this course. A post never
   * changes hands, so the answer stands for the write that follows.
   */
  async postHolder(courseId: string, postId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ userId: roleAssignments.userId })
      .from(roleAssignments)
      .where(this.postIn(courseId, postId))
      .limit(1);
    return row?.userId ?? null;
  }

  private async lockPost(
    tx: Tx,
    courseId: string,
    postId: string
  ): Promise<{ id: string; userId: string; grantedBy: string }> {
    const [row] = await tx
      .select({
        id: roleAssignments.id,
        userId: roleAssignments.userId,
        grantedBy: roleAssignments.grantedBy,
      })
      .from(roleAssignments)
      .where(this.postIn(courseId, postId))
      .for("update")
      .limit(1);
    if (!row) {
      throw new CourseNazirNotFoundError(postId, undefined, "in this course");
    }
    return row;
  }

  /**
   * Makes the person the course's ders nazırı with these permissions, in one
   * transaction with the audit row. The post and the permissions end
   * together; `authority` is the level the giver gives at, null for one who
   * appoints only (and so gives nothing).
   */
  async assign(
    actorId: string,
    courseId: string,
    input: {
      userId: string;
      permissions: string[];
      endsAt: Date | null;
      authority: ScopeType | null;
      standing: "giver" | "appointer";
    }
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Hidden while the request was on its way: `getDetail` let it through.
      const [course] = await tx
        .select({
          id: courses.id,
          koskId: courses.koskId,
          madrasahId: courses.madrasahId,
        })
        .from(courses)
        .where(and(eq(courses.id, courseId), isNull(courses.archivedAt)))
        .for("no key update")
        .limit(1);
      if (!course) {
        throw new GrantCourseInvalidError(
          courseId,
          undefined,
          `Course ${courseId} is hidden`
        );
      }

      const [exists] = await tx
        .select({ id: roleAssignments.id })
        .from(roleAssignments)
        .where(
          and(
            eq(roleAssignments.userId, input.userId),
            eq(roleAssignments.role, NAZIR),
            eq(roleAssignments.scopeId, courseId),
            isHeld()
          )
        )
        .limit(1);
      if (exists) throw new CourseNazirExistsError(input.userId, courseId);

      // A seat over the course already speaks for the person here, and its
      // own permissions in the course could not be told from the post's.
      const [seat] = await tx
        .select({ id: roleAssignments.id })
        .from(roleAssignments)
        .where(
          and(
            eq(roleAssignments.userId, input.userId),
            ne(roleAssignments.role, NAZIR),
            isHeld(),
            or(
              and(
                eq(roleAssignments.scopeType, SCOPE_TYPES.COURSE),
                eq(roleAssignments.scopeId, courseId)
              ),
              and(
                eq(roleAssignments.scopeType, SCOPE_TYPES.KOSK),
                eq(roleAssignments.scopeId, course.koskId)
              ),
              course.madrasahId
                ? and(
                    eq(roleAssignments.scopeType, SCOPE_TYPES.MADRASAH),
                    eq(roleAssignments.scopeId, course.madrasahId)
                  )
                : undefined,
              eq(roleAssignments.scopeType, SCOPE_TYPES.PLATFORM)
            )
          )
        )
        .limit(1);
      if (seat) throw new CourseNazirHoldsSeatError(input.userId, courseId);

      // A post that lapsed but was never revoked would hold the unique index.
      await tx
        .update(roleAssignments)
        .set({ revokedAt: sql`now()`, revokedBy: actorId })
        .where(
          and(
            eq(roleAssignments.userId, input.userId),
            eq(roleAssignments.role, NAZIR),
            eq(roleAssignments.scopeId, courseId),
            isNull(roleAssignments.revokedAt)
          )
        );
      // What an earlier post left open would count again under the new one.
      const leftovers = await tx
        .update(permissionGrants)
        .set({ revokedAt: sql`now()`, revokedBy: actorId })
        .where(
          and(
            eq(permissionGrants.userId, input.userId),
            eq(permissionGrants.scopeType, SCOPE_TYPES.COURSE),
            eq(permissionGrants.scopeId, courseId),
            isNull(permissionGrants.revokedAt)
          )
        )
        .returning({ id: permissionGrants.id });

      const [post] = await tx
        .insert(roleAssignments)
        .values({
          userId: input.userId,
          role: NAZIR,
          scopeType: SCOPE_TYPES.COURSE,
          scopeId: courseId,
          grantedBy: actorId,
          expiresAt: input.endsAt,
        })
        .returning({ id: roleAssignments.id });
      if (input.permissions.length > 0) {
        await tx.insert(permissionGrants).values(
          input.permissions.map((permission) => ({
            userId: input.userId,
            scopeType: SCOPE_TYPES.COURSE,
            scopeId: courseId,
            permission,
            groupId: null,
            grantedBy: actorId,
            authorityScopeType: input.authority,
            expiresAt: input.endsAt,
          }))
        );
      }
      await tx.insert(auditLog).values({
        actorId,
        action: "course_nazir.assign",
        entity: "course",
        entityId: courseId,
        details: {
          via: "course",
          postId: post.id,
          userId: input.userId,
          permissions: input.permissions,
          endsAt: iso(input.endsAt),
          standing: input.standing,
          authority: input.authority,
          revokedLeftovers: leftovers.map((row) => row.id),
        },
      });
    });
  }

  /**
   * Sets the whole set of permissions and the end of a post: what stays keeps
   * its giver and its date, the rest is revoked, shortened, lengthened or
   * added (`planPostGrants`). `ceiling` sees every code handed on in this save
   * (new, or given more time) before anything is written.
   */
  async update(
    actorId: string,
    courseId: string,
    postId: string,
    wanted: {
      permissions: string[];
      endsAt: Date | null;
      authority: ScopeType;
      ceiling: (codes: readonly string[]) => void;
    }
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const post = await this.lockPost(tx, courseId, postId);
      const held = await tx
        .select({
          id: permissionGrants.id,
          permission: permissionGrants.permission,
          groupId: permissionGrants.groupId,
          expiresAt: permissionGrants.expiresAt,
          authority: permissionGrants.authorityScopeType,
        })
        .from(permissionGrants)
        .where(
          and(
            eq(permissionGrants.userId, post.userId),
            eq(permissionGrants.scopeType, SCOPE_TYPES.COURSE),
            eq(permissionGrants.scopeId, courseId),
            grantHeld()
          )
        )
        .orderBy(asc(permissionGrants.createdAt), asc(permissionGrants.id));
      const plan = planPostGrants(held, {
        permissions: wanted.permissions,
        expiresAt: wanted.endsAt,
        actor: wanted.authority,
      });
      const byId = new Map(held.map((row) => [row.id, row]));
      wanted.ceiling([
        ...plan.insert,
        ...plan.extendInPlace.flatMap((id) => byId.get(id)?.permission ?? []),
        ...plan.extendAlongside.map((row) => row.permission),
      ]);

      if (plan.revoke.length > 0) {
        await tx
          .update(permissionGrants)
          .set({ revokedAt: sql`now()`, revokedBy: actorId })
          .where(inArray(permissionGrants.id, plan.revoke));
      }
      if (plan.shorten.length > 0) {
        await tx
          .update(permissionGrants)
          .set({ expiresAt: wanted.endsAt })
          .where(inArray(permissionGrants.id, plan.shorten));
      }
      const extended: Array<{
        id: string;
        from: string | null;
        alongside?: string;
      }> = [];
      if (plan.extendInPlace.length > 0) {
        await tx
          .update(permissionGrants)
          .set({
            expiresAt: wanted.endsAt,
            grantedBy: actorId,
            authorityScopeType: wanted.authority,
          })
          .where(inArray(permissionGrants.id, plan.extendInPlace));
        for (const id of plan.extendInPlace) {
          extended.push({ id, from: iso(byId.get(id)?.expiresAt ?? null) });
        }
      }
      const given = (permission: string) => ({
        userId: post.userId,
        scopeType: SCOPE_TYPES.COURSE,
        scopeId: courseId,
        permission,
        groupId: null,
        grantedBy: actorId,
        authorityScopeType: wanted.authority,
        expiresAt: wanted.endsAt,
      });
      for (const row of plan.extendAlongside) {
        // The actor cannot carry what the row was given with: it stays as it
        // was given, and the extra time is the actor's own row.
        const [fresh] = await tx
          .insert(permissionGrants)
          .values(given(row.permission))
          .returning({ id: permissionGrants.id });
        extended.push({
          id: fresh.id,
          from: iso(byId.get(row.id)?.expiresAt ?? null),
          alongside: row.id,
        });
      }
      const inserted =
        plan.insert.length > 0
          ? await tx
              .insert(permissionGrants)
              .values(plan.insert.map(given))
              .returning({ id: permissionGrants.id })
          : [];
      await tx
        .update(roleAssignments)
        .set({ expiresAt: wanted.endsAt })
        .where(eq(roleAssignments.id, post.id));
      await tx.insert(auditLog).values({
        actorId,
        action: "course_nazir.update",
        entity: "course",
        entityId: courseId,
        details: {
          via: "course",
          postId: post.id,
          userId: post.userId,
          permissions: wanted.permissions,
          endsAt: iso(wanted.endsAt),
          authority: wanted.authority,
          revoked: plan.revoke,
          shortened: plan.shorten.map((id) => ({
            id,
            from: iso(byId.get(id)?.expiresAt ?? null),
          })),
          extended,
          inserted: inserted.map((row) => row.id),
        },
      });
    });
  }

  /**
   * "Görevden al": the post and every permission the person holds in the
   * course end together. With `appointedBy`, only a post that person
   * appointed. Refused, with nothing written, while someone the holder
   * appointed still holds their post: the remover ends those first.
   */
  async revoke(
    actorId: string,
    courseId: string,
    postId: string,
    only: { appointedBy?: string } = {}
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const post = await this.lockPost(tx, courseId, postId);
      if (
        only.appointedBy !== undefined &&
        post.grantedBy.toLowerCase() !== only.appointedBy.toLowerCase()
      ) {
        throw new NazirNotAppointedByYouError();
      }
      const grants = await tx
        .update(permissionGrants)
        .set({ revokedAt: sql`now()`, revokedBy: actorId })
        .where(
          and(
            eq(permissionGrants.userId, post.userId),
            eq(permissionGrants.scopeType, SCOPE_TYPES.COURSE),
            eq(permissionGrants.scopeId, courseId),
            isNull(permissionGrants.revokedAt)
          )
        )
        .returning({ id: permissionGrants.id });
      await tx
        .update(roleAssignments)
        .set({ revokedAt: sql`now()`, revokedBy: actorId })
        .where(eq(roleAssignments.id, post.id));
      await assertNothingLeftUnder(tx, [
        {
          userId: post.userId,
          scopeType: SCOPE_TYPES.COURSE,
          scopeId: courseId,
        },
      ]);
      await tx.insert(auditLog).values({
        actorId,
        action: "course_nazir.revoke",
        entity: "course",
        entityId: courseId,
        details: {
          via: "course",
          postId: post.id,
          userId: post.userId,
          grantIds: grants.map((row) => row.id),
        },
      });
    });
  }
}
