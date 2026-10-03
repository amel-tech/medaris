import { Injectable } from "@nestjs/common";
import {
  and,
  asc,
  desc,
  eq,
  exists as existsSql,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
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
import { CourseStatus } from "../course/domain/course-status.enum";
import { EnrollmentStatus } from "../course/domain/enrollment-status.enum";
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
import { flashcards } from "../database/schema/flashcard.schema";
import { decks, decksUsers } from "../database/schema/flashcard-deck.schema";
import { koskFollowers, kosks } from "../database/schema/kosk.schema";
import {
  ASSIGNED_ROLES,
  madrasahKoskHosting,
  roleAssignments,
  SCOPE_TYPES,
} from "../database/schema/role-assignment.schema";
import { users } from "../database/schema/user.schema";
import {
  AddManagerOutcome,
  ICreateKosk,
  IFollowedKoskCourse,
  IKosk,
  IKoskDecks,
  IKoskListFilter,
  IKoskRef,
  IKoskRepository,
  IKoskVisibility,
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
      // Its KOSK_NAZIM holders (MDRS-134), oldest grant first.
      managerIds: holderIdsOf(ASSIGNED_ROLES.KOSK_NAZIM, sql`"kosks"."id"`),
      // The name the köşk's page shows as "Köşk nazımı" (MDRS-160): its oldest
      // KOSK_NAZIM holder's given and family name, null when the person has
      // no name on file. A name is public; the id beside it is not.
      managerName: sql<
        string | null
      >`(select nullif(btrim(concat_ws(' ', u.given_name, u.family_name)), '') from "users" u where u.id::text = (${holderIdsOf(ASSIGNED_ROLES.KOSK_NAZIM, sql`"kosks"."id"`)})[1])`,
      // The course count leaves out drafts (MDRS-159: it is the number the köşk's
      // page lists), and the three course-derived counts leave hidden courses
      // out (MDRS-124):
      // a hidden course is in no list, so it is in no total either.
      courseCount:
        sql<number>`(select count(*) from ${courses} c where c.kosk_id = "kosks"."id" and c.archived_at is null and c.status = 'PUBLISHED')`.mapWith(
          Number
        ),
      studentCount:
        sql<number>`(select count(distinct e.user_id) from ${enrollments} e join ${courses} c on e.course_id = c.id where c.kosk_id = "kosks"."id" and c.archived_at is null and e.status <> 'REVOKED')`.mapWith(
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

  private selectWithStats(userId: string | null) {
    return this.db.select(this.statsSelect(userId)).from(kosks);
  }

  private toStats(row: {
    kosk: IKosk;
    managerIds: string[];
    managerName: string | null;
    courseCount: number;
    studentCount: number;
    muderrisCount: number;
    followerCount: number;
    isFollowing: boolean;
  }): IKoskWithStats {
    return {
      ...row.kosk,
      managerIds: row.managerIds,
      managerName: row.managerName,
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
    level,
    field,
    q,
  }: IKoskListFilter = {}): SQL | undefined {
    // A hidden köşk (MDRS-174) is in no list, its nazımları' own included:
    // the archive and the başnazım's directory are where it is found.
    const conditions: (SQL | undefined)[] = [isNull(kosks.archivedAt)];
    if (managerId === undefined) {
      // A hidden köşk (MDRS-173) is in no public list either.
      conditions.push(eq(kosks.isPrivate, false), isNull(kosks.archivedAt));
    } else if (!UUID_REGEX.test(managerId)) {
      return sql`false`;
    } else {
      conditions.push(
        existsSql(
          this.db
            .select({ one: sql`1` })
            .from(roleAssignments)
            .where(
              and(
                eq(roleAssignments.userId, managerId),
                holdsIn(ASSIGNED_ROLES.KOSK_NAZIM, kosks.id)
              )
            )
        )
      );
    }
    if (madrasahId !== undefined) {
      // A held hosting right is the only medrese–köşk link (MDRS-134).
      conditions.push(
        existsSql(
          this.db
            .select({ one: sql`1` })
            .from(madrasahKoskHosting)
            .where(
              and(
                eq(madrasahKoskHosting.koskId, kosks.id),
                eq(madrasahKoskHosting.madrasahId, madrasahId),
                isNull(madrasahKoskHosting.revokedAt)
              )
            )
        )
      );
    }
    if (level !== undefined) conditions.push(eq(kosks.level, level));
    if (field !== undefined) conditions.push(eq(kosks.field, field));
    const words = (q ?? "").split(/\s+/).filter(Boolean);
    for (const word of words) {
      // `%`, `_` and the escape itself are text here, not wildcards.
      const pattern = `%${word.replace(/[\\%_]/g, "\\$&")}%`;
      conditions.push(
        or(
          ilike(kosks.name, pattern),
          ilike(kosks.handle, pattern),
          ilike(kosks.description, pattern),
          ilike(kosks.field, pattern)
        )
      );
    }
    return and(...conditions);
  }

  async listFields(): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ field: kosks.field })
      .from(kosks)
      .where(
        and(
          eq(kosks.isPrivate, false),
          isNull(kosks.archivedAt),
          isNotNull(kosks.field)
        )
      )
      .orderBy(asc(kosks.field));
    return rows.flatMap((r) => (r.field ? [r.field] : []));
  }

  /**
   * The köşk's decks for a caller who belongs to it: talebe (ENROLLED or
   * COMPLETED) of one of its courses, müderris of one, or its manager. Anyone
   * else gets `accessible: false` and no decks. Only shared (`is_public`) decks
   * are offered: the deck endpoints read a deck by its own rules, and a deck
   * the talebe cannot open would be a dead link (MDRS-159).
   */
  async findDecks(koskId: string, userId: string): Promise<IKoskDecks> {
    if (!UUID_REGEX.test(koskId) || !UUID_REGEX.test(userId)) {
      return { accessible: false, decks: [] };
    }
    const [talebe, muderris, manager] = await Promise.all([
      this.db
        .select({ one: sql`1` })
        .from(enrollments)
        .innerJoin(courses, eq(courses.id, enrollments.courseId))
        .where(
          and(
            eq(courses.koskId, koskId),
            isNull(courses.archivedAt),
            eq(enrollments.userId, userId),
            or(
              eq(enrollments.status, EnrollmentStatus.ENROLLED),
              eq(enrollments.status, EnrollmentStatus.COMPLETED)
            )
          )
        )
        .limit(1),
      this.db
        .select({ one: sql`1` })
        .from(courseMuderris)
        .innerJoin(courses, eq(courses.id, courseMuderris.courseId))
        .where(
          and(eq(courses.koskId, koskId), eq(courseMuderris.userId, userId))
        )
        .limit(1),
      this.isManager(koskId, userId),
    ]);
    const belongs = talebe.length > 0 || muderris.length > 0 || manager;
    if (!belongs) return { accessible: false, decks: [] };

    const rows = await this.db
      .select({
        id: decks.id,
        title: decks.title,
        cardCount:
          sql<number>`(select count(*) from ${flashcards} f where f.deck_id = "decks"."id")`.mapWith(
            Number
          ),
        inCollection:
          sql<boolean>`exists(select 1 from ${decksUsers} du where du.deck_id = "decks"."id" and du.user_id = ${userId})`.mapWith(
            Boolean
          ),
      })
      .from(decks)
      .where(
        and(
          eq(decks.koskId, koskId),
          eq(decks.isPublic, true),
          isNull(decks.archivedAt)
        )
      )
      .orderBy(asc(decks.title), asc(decks.id));
    return { accessible: true, decks: rows };
  }

  /**
   * The published courses of the köşks `userId` follows, newest first, leaving
   * out the ones they already applied to or are in (a talebe is not invited to
   * a course they have). Hidden courses, hidden köşks and unlisted köşks
   * (`is_private`, MDRS-122: in no list, for anyone) are not offered.
   */
  async findFollowedCourses(
    userId: string,
    limit: number
  ): Promise<IFollowedKoskCourse[]> {
    const rows = await this.db
      .select({
        id: courses.id,
        title: courses.title,
        koskId: courses.koskId,
        koskName: kosks.name,
        coverHue: courses.coverHue,
        // The first müderris by the order the course lists them in.
        muderrisName: sql<string | null>`(
          SELECT ${courseMuderris.name}
          FROM ${courseMuderris}
          WHERE ${courseMuderris.courseId} = ${courses.id}
          ORDER BY ${courseMuderris.orderIndex}, ${courseMuderris.id}
          LIMIT 1
        )`,
        muderrisUserId: sql<string | null>`(
          SELECT ${courseMuderris.userId}
          FROM ${courseMuderris}
          WHERE ${courseMuderris.courseId} = ${courses.id}
          ORDER BY ${courseMuderris.orderIndex}, ${courseMuderris.id}
          LIMIT 1
        )`,
      })
      .from(koskFollowers)
      .innerJoin(kosks, eq(kosks.id, koskFollowers.koskId))
      .innerJoin(courses, eq(courses.koskId, kosks.id))
      .where(
        and(
          eq(koskFollowers.userId, userId),
          eq(kosks.isPrivate, false),
          isNull(kosks.archivedAt),
          eq(courses.status, CourseStatus.PUBLISHED),
          isNull(courses.archivedAt),
          sql`NOT EXISTS (
            SELECT 1 FROM ${enrollments}
            WHERE ${enrollments.courseId} = ${courses.id}
              AND ${enrollments.userId} = ${userId}
          )`
        )
      )
      .orderBy(desc(courses.createdAt), desc(courses.id))
      .limit(limit);
    if (rows.length === 0) return [];

    // Whether the first müderris is the course's imam: a role assignment, not
    // a column of the müderris row (see `CourseRepository.madrasahsAndImamsOf`).
    const imams = await this.db
      .select({
        courseId: roleAssignments.scopeId,
        userId: roleAssignments.userId,
      })
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.role, ASSIGNED_ROLES.MUDERRIS),
          eq(roleAssignments.isImam, true),
          inArray(
            roleAssignments.scopeId,
            rows.map((r) => r.id)
          ),
          isHeld()
        )
      );
    const imamKeys = new Set(imams.map((i) => `${i.courseId}:${i.userId}`));
    return rows.map(({ muderrisUserId, ...row }) => ({
      ...row,
      muderrisIsImam:
        muderrisUserId !== null && imamKeys.has(`${row.id}:${muderrisUserId}`),
    }));
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

  async findVisibility(id: string): Promise<IKoskVisibility | null> {
    const rows = await this.db
      .select({
        isPrivate: kosks.isPrivate,
        archivedAt: kosks.archivedAt,
        alwaysRequireApproval: kosks.alwaysRequireApproval,
        recordingsNeverPublic: kosks.recordingsNeverPublic,
      })
      .from(kosks)
      .where(eq(kosks.id, id))
      .limit(1);
    const row = rows[0];
    return row
      ? {
          isPrivate: row.isPrivate,
          hidden: row.archivedAt !== null,
          alwaysRequireApproval: row.alwaysRequireApproval,
          recordingsNeverPublic: row.recordingsNeverPublic,
        }
      : null;
  }

  /**
   * Whether another köşk already uses this short name. Compared without case
   * and without a leading "@", which older rows may carry.
   */
  async handleTaken(handle: string, exceptId?: string): Promise<boolean> {
    const wanted = handle.trim().replace(/^@+/, "").toLowerCase();
    if (wanted === "") return false;
    const rows = await this.db
      .select({ id: kosks.id })
      .from(kosks)
      .where(
        and(
          sql`lower(ltrim(${kosks.handle}, '@')) = ${wanted}`,
          exceptId ? ne(kosks.id, exceptId) : undefined
        )
      )
      .limit(1);
    return rows.length > 0;
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
