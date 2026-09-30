import { Injectable } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  courseIdsOfKosk,
  IPurgeCounts,
  purgeCourses,
  recordDeletion,
  Tx,
} from "../course/course-purge";
import { DatabaseService } from "../database/database.service";
import {
  deleteAssignmentsIn,
  grantRole,
  holderIdsOf,
  holdsIn,
  isHeld,
  revokeRole,
} from "../database/role-assignments";
import {
  courseMuderris,
  courses,
  enrollments,
} from "../database/schema/course.schema";
import { koskFollowers, kosks } from "../database/schema/kosk.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
  SCOPE_TYPES,
} from "../database/schema/role-assignment.schema";
import { users } from "../database/schema/user.schema";
import {
  AddManagerOutcome,
  ICreateKosk,
  IKosk,
  IKoskRef,
  IKoskRepository,
  IKoskWithStats,
  IManagerActor,
  IUpdateKosk,
  RemoveManagerOutcome,
} from "./kosk.repository.interface";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class KoskRepository implements IKoskRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  private statsSelect(userId: string) {
    return {
      kosk: kosks,
      // Its KOSK_NAZIM holders (MDRS-134), oldest grant first.
      managerIds: holderIdsOf(ASSIGNED_ROLES.KOSK_NAZIM, sql`"kosks"."id"`),
      // The three course-derived counts leave hidden courses out (MDRS-124):
      // a hidden course is in no list, so it is in no total either.
      courseCount:
        sql<number>`(select count(*) from ${courses} c where c.kosk_id = "kosks"."id" and c.archived_at is null)`.mapWith(
          Number
        ),
      studentCount:
        sql<number>`(select count(distinct e.user_id) from ${enrollments} e join ${courses} c on e.course_id = c.id where c.kosk_id = "kosks"."id" and c.archived_at is null)`.mapWith(
          Number
        ),
      muderrisCount:
        sql<number>`(select count(distinct cm.id) from ${courseMuderris} cm join ${courses} c on cm.course_id = c.id where c.kosk_id = "kosks"."id" and c.archived_at is null)`.mapWith(
          Number
        ),
      followerCount:
        sql<number>`(select count(*) from ${koskFollowers} kf where kf.kosk_id = "kosks"."id")`.mapWith(
          Number
        ),
      isFollowing:
        sql<boolean>`exists(select 1 from ${koskFollowers} kf where kf.kosk_id = "kosks"."id" and kf.user_id = ${userId})`.mapWith(
          Boolean
        ),
    };
  }

  private selectWithStats(userId: string) {
    return this.db.select(this.statsSelect(userId)).from(kosks);
  }

  private toStats(row: {
    kosk: IKosk;
    managerIds: string[];
    courseCount: number;
    studentCount: number;
    muderrisCount: number;
    followerCount: number;
    isFollowing: boolean;
  }): IKoskWithStats {
    return {
      ...row.kosk,
      managerIds: row.managerIds,
      courseCount: row.courseCount,
      studentCount: row.studentCount,
      muderrisCount: row.muderrisCount,
      followerCount: row.followerCount,
      isFollowing: row.isFollowing,
    };
  }

  async findAll(
    userId: string,
    limit: number,
    offset: number
  ): Promise<IKoskWithStats[]> {
    const rows = await this.selectWithStats(userId)
      .orderBy(desc(kosks.featured), desc(kosks.createdAt))
      .limit(limit)
      .offset(offset);
    return rows.map((r) => this.toStats(r));
  }

  async count(): Promise<number> {
    const [row] = await this.db
      .select({ value: sql<number>`count(*)`.mapWith(Number) })
      .from(kosks);
    return row?.value ?? 0;
  }

  async findById(id: string, userId: string): Promise<IKoskWithStats | null> {
    const rows = await this.selectWithStats(userId).where(eq(kosks.id, id));
    return rows[0] ? this.toStats(rows[0]) : null;
  }

  async exists(id: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: kosks.id })
      .from(kosks)
      .where(eq(kosks.id, id))
      .limit(1);
    return rows.length > 0;
  }

  /**
   * A köşk's managers are its KOSK_NAZIM holders (MDRS-134).
   * `role_assignments.user_id` is a `uuid`, and `userId` is a token's `sub`: a
   * realm that mints a non-UUID `sub` (see `identityFromClaims`) manages
   * nothing, rather than failing the guard with a Postgres 22P02. The old
   * owner check compared in JavaScript and never reached that error.
   */
  async isManager(koskId: string, userId: string): Promise<boolean> {
    if (!UUID_REGEX.test(koskId) || !UUID_REGEX.test(userId)) return false;
    const rows = await this.db
      .select({ id: roleAssignments.id })
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.userId, userId),
          holdsIn(ASSIGNED_ROLES.KOSK_NAZIM, koskId)
        )
      )
      .limit(1);
    return rows.length > 0;
  }

  async findManagedBy(userId: string): Promise<IKoskRef[]> {
    return this.db
      .select({ id: kosks.id, name: kosks.name })
      .from(kosks)
      .innerJoin(roleAssignments, holdsIn(ASSIGNED_ROLES.KOSK_NAZIM, kosks.id))
      .where(eq(roleAssignments.userId, userId))
      .orderBy(kosks.name);
  }

  async managesAny(userId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: roleAssignments.id })
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.userId, userId),
          eq(roleAssignments.role, ASSIGNED_ROLES.KOSK_NAZIM),
          isHeld()
        )
      )
      .limit(1);
    return rows.length > 0;
  }

  /** The köşk and its first manager land together or not at all. */
  async create(kosk: ICreateKosk): Promise<IKosk> {
    return this.db.transaction(async (tx) => {
      const [created] = await tx.insert(kosks).values(kosk).returning();
      await grantRole(tx, {
        userId: kosk.ownerId,
        role: ASSIGNED_ROLES.KOSK_NAZIM,
        scopeId: created.id,
        grantedBy: kosk.ownerId,
      });
      return created;
    });
  }

  /**
   * Locks the köşk row and returns its managers, or null for no köşk. Every
   * change to a köşk's managers runs after this in its own transaction, so
   * they queue on the köşk one by one and each sees the others' result.
   * `NO KEY UPDATE`, not `UPDATE`: it still serialises these transactions but
   * does not block the `KEY SHARE` lock a foreign-key insert under the köşk
   * (a course, a follower) takes.
   */
  private async lockManagers(tx: Tx, koskId: string): Promise<string[] | null> {
    const [kosk] = await tx
      .select({ id: kosks.id })
      .from(kosks)
      .where(eq(kosks.id, koskId))
      .for("no key update");
    if (!kosk) return null;
    const rows = await tx
      .select({ userId: roleAssignments.userId })
      .from(roleAssignments)
      .where(holdsIn(ASSIGNED_ROLES.KOSK_NAZIM, koskId));
    return rows.map((r) => r.userId);
  }

  /**
   * Adds `userId` as a manager. The actor's right is checked again under the
   * lock — the guard checked it before a concurrent removal could take it
   * away — unless `actor.bypass` (SYSTEM_ADMIN). Only a user with a `users`
   * row (someone who has signed in, MDRS-104) can be added, so a mistyped id
   * cannot become the manager that lets the last real one leave.
   * Idempotent for an existing manager.
   */
  async addManager(
    koskId: string,
    userId: string,
    actor: IManagerActor
  ): Promise<AddManagerOutcome> {
    const target = userId.toLowerCase();
    return this.db.transaction(async (tx) => {
      const managers = await this.lockManagers(tx, koskId);
      if (managers === null) return "no-kosk";
      if (!actor.bypass && !managers.includes(actor.id.toLowerCase())) {
        return "forbidden";
      }
      if (managers.includes(target)) return "added";
      const [known] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, target))
        .limit(1);
      if (!known) return "unknown-user";
      await grantRole(tx, {
        userId: target,
        role: ASSIGNED_ROLES.KOSK_NAZIM,
        scopeId: koskId,
        grantedBy: actor.id,
      });
      return "added";
    });
  }

  /**
   * Removes a manager unless they are the last one. The row is revoked in the
   * actor's name, not deleted (MDRS-134), so who took the role away stays on
   * record. Under the köşk lock (see
   * `lockManagers`), so two removals racing for the last two managers run one
   * after the other: the second sees a single manager left and is refused,
   * instead of both deleting and leaving the köşk with none. The actor's right
   * is re-checked there too, as in `addManager`.
   */
  async removeManager(
    koskId: string,
    userId: string,
    actor: IManagerActor
  ): Promise<RemoveManagerOutcome> {
    const target = userId.toLowerCase();
    return this.db.transaction(async (tx) => {
      const managers = await this.lockManagers(tx, koskId);
      if (managers === null) return "no-kosk";
      if (!actor.bypass && !managers.includes(actor.id.toLowerCase())) {
        return "forbidden";
      }
      if (!managers.includes(target)) return "not-manager";
      if (managers.length === 1) return "last";
      await revokeRole(tx, {
        userId: target,
        role: ASSIGNED_ROLES.KOSK_NAZIM,
        scopeId: koskId,
        revokedBy: actor.id,
      });
      return "removed";
    });
  }

  async update(id: string, updates: IUpdateKosk): Promise<IKosk | null> {
    return this.db
      .update(kosks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(kosks.id, id))
      .returning()
      .then((result) => result[0] || null);
  }

  /**
   * SYSTEM_ADMIN's real delete (MDRS-124): every course of the köşk with
   * everything under it, its followers, the köşk, and one `audit_log` entry
   * naming what went — in one transaction. `courses.kosk_id` is
   * `ON DELETE RESTRICT`, so the courses have to go first and explicitly.
   * Null when there is no such köşk.
   */
  async purge(
    id: string,
    actorId: string
  ): Promise<(IPurgeCounts & { followers: number }) | null> {
    return this.db.transaction(async (tx) => {
      const [kosk] = await tx
        .select({ name: kosks.name })
        .from(kosks)
        .where(eq(kosks.id, id))
        .for("update");
      if (!kosk) return null;

      const removed = await purgeCourses(tx, await courseIdsOfKosk(tx, id));
      const followers = (
        await tx
          .delete(koskFollowers)
          .where(eq(koskFollowers.koskId, id))
          .returning({ userId: koskFollowers.userId })
      ).length;
      // `scope_id` is no foreign key, so nothing cascades: the köşk's role
      // rows go explicitly, and the audit entry names who managed it
      // (MDRS-126), which is otherwise lost with it. Its hosting rights
      // cascade with the köşk row.
      const managers = await deleteAssignmentsIn(tx, SCOPE_TYPES.KOSK, [id]);
      await tx.delete(kosks).where(eq(kosks.id, id));
      await recordDeletion(tx, {
        actorId,
        entity: "kosk",
        entityId: id,
        details: {
          name: kosk.name,
          managers,
          removed: { ...removed, followers },
        },
      });
      return { ...removed, followers };
    });
  }

  async follow(userId: string, koskId: string): Promise<boolean> {
    await this.db
      .insert(koskFollowers)
      .values({ userId, koskId })
      .onConflictDoNothing();
    return true;
  }

  async unfollow(userId: string, koskId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(koskFollowers)
      .where(
        and(eq(koskFollowers.userId, userId), eq(koskFollowers.koskId, koskId))
      )
      .returning();
    return deleted.length > 0;
  }
}
