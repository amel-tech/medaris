import { Injectable } from "@nestjs/common";
import { and, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import {
  courseIdsOfKosk,
  IPurgeCounts,
  purgeCourses,
  recordDeletion,
} from "../course/course-purge";
import { DatabaseService } from "../database/database.service";
import {
  courseMuderris,
  courses,
  enrollments,
} from "../database/schema/course.schema";
import { koskFollowers, kosks } from "../database/schema/kosk.schema";
import { madrasahs } from "../database/schema/madrasah.schema";
import {
  ICreateKosk,
  IKosk,
  IKoskRef,
  IKoskRepository,
  IKoskWithStats,
  IUpdateKosk,
} from "./kosk.repository.interface";

@Injectable()
export class KoskRepository implements IKoskRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  private statsSelect(userId: string) {
    return {
      kosk: kosks,
      // Left-joined (see `withMadrasah`); all three are null for a köşk that
      // stands alone.
      madrasahName: madrasahs.name,
      madrasahHandle: madrasahs.handle,
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

  /** Every köşk read carries its medrese (MDRS-106), so every read joins. */
  private selectWithStats(userId: string) {
    return this.db
      .select(this.statsSelect(userId))
      .from(kosks)
      .leftJoin(madrasahs, eq(kosks.madrasahId, madrasahs.id));
  }

  private toStats(row: {
    kosk: IKosk;
    madrasahName: string | null;
    madrasahHandle: string | null;
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

  async findOwnerId(id: string): Promise<string | null> {
    const rows = await this.db
      .select({ ownerId: kosks.ownerId })
      .from(kosks)
      .where(eq(kosks.id, id))
      .limit(1);
    return rows[0]?.ownerId ?? null;
  }

  async findOwnedBy(ownerId: string): Promise<IKoskRef[]> {
    return this.db
      .select({ id: kosks.id, name: kosks.name })
      .from(kosks)
      .where(eq(kosks.ownerId, ownerId))
      .orderBy(kosks.name);
  }

  async ownsAny(ownerId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: kosks.id })
      .from(kosks)
      .where(eq(kosks.ownerId, ownerId))
      .limit(1);
    return rows.length > 0;
  }

  async create(kosk: ICreateKosk): Promise<IKosk> {
    const [created] = await this.db.insert(kosks).values(kosk).returning();
    return created;
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
      await tx.delete(kosks).where(eq(kosks.id, id));
      await recordDeletion(tx, {
        actorId,
        entity: "kosk",
        entityId: id,
        details: { name: kosk.name, removed: { ...removed, followers } },
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
