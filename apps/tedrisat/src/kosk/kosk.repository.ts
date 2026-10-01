import { Injectable } from "@nestjs/common";
import {
  and,
  desc,
  eq,
  exists as existsSql,
  isNotNull,
  isNull,
  or,
  SQL,
  sql,
} from "drizzle-orm";
import {
  courseIdsOfKosk,
  IPurgeCounts,
  purgeCourses,
  recordDeletion,
  Tx,
} from "../course/course-purge";
import { DatabaseService } from "../database/database.service";
import {
  courseMuderris,
  courses,
  enrollments,
} from "../database/schema/course.schema";
import {
  koskFollowers,
  koskManagers,
  kosks,
} from "../database/schema/kosk.schema";
import { madrasahs } from "../database/schema/madrasah.schema";
import { users } from "../database/schema/user.schema";
import {
  AddManagerOutcome,
  ICreateKosk,
  IKosk,
  IKoskListFilter,
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

  private statsSelect(userId: string | null) {
    return {
      kosk: kosks,
      // Left-joined (see `withMadrasah`); all three are null for a köşk that
      // stands alone.
      madrasahName: madrasahs.name,
      madrasahHandle: madrasahs.handle,
      managerIds: sql<
        string[]
      >`coalesce((select array_agg(m.user_id::text order by m.created_at, m.user_id) from ${koskManagers} m where m.kosk_id = "kosks"."id"), '{}')`,
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
      // A caller with no token (MDRS-122) follows nothing — said here rather
      // than left to how `user_id = NULL` compares.
      isFollowing:
        userId === null
          ? sql<boolean>`false`.mapWith(Boolean)
          : sql<boolean>`exists(select 1 from ${koskFollowers} kf where kf.kosk_id = "kosks"."id" and kf.user_id = ${userId})`.mapWith(
              Boolean
            ),
    };
  }

  /** Every köşk read carries its medrese (MDRS-106), so every read joins. */
  private selectWithStats(userId: string | null) {
    return this.db
      .select(this.statsSelect(userId))
      .from(kosks)
      .leftJoin(madrasahs, eq(kosks.madrasahId, madrasahs.id));
  }

  private toStats(row: {
    kosk: IKosk;
    madrasahName: string | null;
    madrasahHandle: string | null;
    managerIds: string[];
    courseCount: number;
    studentCount: number;
    muderrisCount: number;
    followerCount: number;
    isFollowing: boolean;
  }): IKoskWithStats {
    const { madrasahId } = row.kosk;
    return {
      ...row.kosk,
      madrasah:
        madrasahId !== null &&
        row.madrasahName !== null &&
        row.madrasahHandle !== null
          ? {
              id: madrasahId,
              name: row.madrasahName,
              handle: row.madrasahHandle,
            }
          : null,
      managerIds: row.managerIds,
      courseCount: row.courseCount,
      studentCount: row.studentCount,
      muderrisCount: row.muderrisCount,
      followerCount: row.followerCount,
      isFollowing: row.isFollowing,
    };
  }

  /**
   * The listing's WHERE clause. A `managerId` that is not a UUID (a realm
   * minting a non-UUID `sub`, see `isManager`) manages nothing, so it matches
   * no row instead of failing in Postgres with 22P02 — `sql\`false\`` rather
   * than an early return, so `findAll` and `count` stay one query each and
   * cannot disagree.
   *
   * Without `managerId` this is the public listing, and an unlisted köşk
   * (`is_private`, MDRS-122) is not in it — for anyone, signed in or not,
   * SYSTEM_ADMIN included. It is reached by its link only. The manager's own
   * list (`managedBy=me`) is where they find it again.
   */
  private listWhere({
    managerId,
    madrasahId,
  }: IKoskListFilter = {}): SQL | undefined {
    const conditions: (SQL | undefined)[] = [];
    if (managerId === undefined) {
      conditions.push(eq(kosks.isPrivate, false));
    } else if (!UUID_REGEX.test(managerId)) {
      return sql`false`;
    } else {
      conditions.push(
        existsSql(
          this.db
            .select({ one: sql`1` })
            .from(koskManagers)
            .where(
              and(
                eq(koskManagers.koskId, kosks.id),
                eq(koskManagers.userId, managerId)
              )
            )
        )
      );
    }
    if (madrasahId !== undefined) {
      conditions.push(eq(kosks.madrasahId, madrasahId));
    }
    return and(...conditions);
  }

  async findAll(
    userId: string | null,
    limit: number,
    offset: number,
    filter: IKoskListFilter = {}
  ): Promise<IKoskWithStats[]> {
    const rows = await this.selectWithStats(userId)
      .where(this.listWhere(filter))
      // `id` last: two köşks created in the same instant would otherwise
      // swap places between pages.
      .orderBy(desc(kosks.featured), desc(kosks.createdAt), desc(kosks.id))
      .limit(limit)
      .offset(offset);
    return rows.map((r) => this.toStats(r));
  }

  async count(filter: IKoskListFilter = {}): Promise<number> {
    const [row] = await this.db
      .select({ value: sql<number>`count(*)`.mapWith(Number) })
      .from(kosks)
      .where(this.listWhere(filter));
    return row?.value ?? 0;
  }

  async findById(
    id: string,
    userId: string | null
  ): Promise<IKoskWithStats | null> {
    const rows = await this.selectWithStats(userId).where(eq(kosks.id, id));
    return rows[0] ? this.toStats(rows[0]) : null;
  }

  async findVisibility(id: string): Promise<{ isPrivate: boolean } | null> {
    const rows = await this.db
      .select({ isPrivate: kosks.isPrivate })
      .from(kosks)
      .where(eq(kosks.id, id))
      .limit(1);
    return rows[0] ?? null;
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
   * `kosk_managers.user_id` is a `uuid`, and `userId` is a token's `sub`: a
   * realm that mints a non-UUID `sub` (see `identityFromClaims`) manages
   * nothing, rather than failing the guard with a Postgres 22P02. The old
   * owner check compared in JavaScript and never reached that error.
   */
  async isManager(koskId: string, userId: string): Promise<boolean> {
    if (!UUID_REGEX.test(koskId) || !UUID_REGEX.test(userId)) return false;
    const rows = await this.db
      .select({ userId: koskManagers.userId })
      .from(koskManagers)
      .where(
        and(eq(koskManagers.koskId, koskId), eq(koskManagers.userId, userId))
      )
      .limit(1);
    return rows.length > 0;
  }

  async findManagedBy(userId: string): Promise<IKoskRef[]> {
    return this.db
      .select({ id: kosks.id, name: kosks.name })
      .from(kosks)
      .innerJoin(koskManagers, eq(koskManagers.koskId, kosks.id))
      .where(eq(koskManagers.userId, userId))
      .orderBy(kosks.name);
  }

  async managesAny(userId: string): Promise<boolean> {
    const rows = await this.db
      .select({ koskId: koskManagers.koskId })
      .from(koskManagers)
      .where(eq(koskManagers.userId, userId))
      .limit(1);
    return rows.length > 0;
  }

  /** The köşk and its first manager land together or not at all. */
  async create(kosk: ICreateKosk): Promise<IKosk> {
    return this.db.transaction(async (tx) => {
      const [created] = await tx.insert(kosks).values(kosk).returning();
      await tx.insert(koskManagers).values({
        koskId: created.id,
        userId: kosk.ownerId,
        addedBy: kosk.ownerId,
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
      .select({ userId: koskManagers.userId })
      .from(koskManagers)
      .where(eq(koskManagers.koskId, koskId));
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
      await tx
        .insert(koskManagers)
        .values({ koskId, userId: target, addedBy: actor.id })
        .onConflictDoNothing();
      return "added";
    });
  }

  /**
   * Removes a manager unless they are the last one. Under the köşk lock (see
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
      await tx
        .delete(koskManagers)
        .where(
          and(eq(koskManagers.koskId, koskId), eq(koskManagers.userId, target))
        );
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
      // Explicit, though the foreign key cascades: the audit entry names who
      // managed the köşk (MDRS-126), which is otherwise lost with it.
      const managers = (
        await tx
          .delete(koskManagers)
          .where(eq(koskManagers.koskId, id))
          .returning({ userId: koskManagers.userId })
      ).map((m) => m.userId);
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

  /**
   * Binds the köşk to `madrasahId` unless it already belongs to another
   * medrese. False when nothing matched — the köşk is missing or taken; the
   * service tells the two apart. Re-affiliating with the same medrese
   * matches, so the call is idempotent.
   */
  async affiliate(koskId: string, madrasahId: string): Promise<boolean> {
    const updated = await this.db
      .update(kosks)
      .set({ madrasahId, updatedAt: new Date() })
      .where(
        and(
          eq(kosks.id, koskId),
          or(isNull(kosks.madrasahId), eq(kosks.madrasahId, madrasahId))
        )
      )
      .returning({ id: kosks.id });
    return updated.length > 0;
  }

  /** Unbinds the köşk from whichever medrese it belongs to, if any. */
  async leaveMadrasah(koskId: string): Promise<boolean> {
    const updated = await this.db
      .update(kosks)
      .set({ madrasahId: null, updatedAt: new Date() })
      .where(and(eq(kosks.id, koskId), isNotNull(kosks.madrasahId)))
      .returning({ id: kosks.id });
    return updated.length > 0;
  }

  /** Unbinds the köşk, only if it belongs to `madrasahId`. */
  async detach(koskId: string, madrasahId: string): Promise<boolean> {
    const updated = await this.db
      .update(kosks)
      .set({ madrasahId: null, updatedAt: new Date() })
      .where(and(eq(kosks.id, koskId), eq(kosks.madrasahId, madrasahId)))
      .returning({ id: kosks.id });
    return updated.length > 0;
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
