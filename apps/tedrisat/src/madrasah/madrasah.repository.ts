import { Injectable } from "@nestjs/common";
import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  min,
  type SQL,
  sql,
} from "drizzle-orm";
import { ArchiveRestoreLevelError } from "../archive/errors/archive-errors";
import { recordHide } from "../archive/hide-audit";
import {
  type HideLevel,
  hiderLevelOf,
  mayRestoreAt,
} from "../archive/hide-level";
import { DismissDecisionsError } from "../assignment/admin/errors";
import { grantHeld } from "../assignment/assignment.repository";
import { recordDeletion, type Tx } from "../course/course-purge";
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
import { auditLog } from "../database/schema/audit.schema";
import {
  courseMuderris,
  courses,
  courseWeeks,
  enrollments,
  lessons,
} from "../database/schema/course.schema";
import { kosks } from "../database/schema/kosk.schema";
import {
  madrasahSettings,
  madrasahs,
} from "../database/schema/madrasah.schema";
import {
  permissionGrants,
  permissionGroups,
} from "../database/schema/permission.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
  SCOPE_TYPES,
} from "../database/schema/role-assignment.schema";
import { users } from "../database/schema/user.schema";
import { auditImpactOf } from "../passivation/passivation-impact";
import { PassivationImpactRepository } from "../passivation/passivation-impact.repository";
import {
  DeactivateMadrasahResult,
  HideMadrasahResult,
  ICreateMadrasah,
  ICreateMadrasahWithHead,
  IHeadDelegation,
  IMadrasah,
  IMadrasahBadgeCounts,
  IMadrasahCourse,
  IMadrasahCourseFilter,
  IMadrasahCourseListItem,
  IMadrasahDirectoryFilter,
  IMadrasahDirectoryItem,
  IMadrasahExplore,
  IMadrasahExploreFilter,
  IMadrasahHeadMuderris,
  IMadrasahOverview,
  IMadrasahSettings,
  IMadrasahStatusCounts,
  IMadrasahWithNazirs,
  IPassiveMadrasah,
  IUpdateMadrasah,
  IUpdateMadrasahSettings,
  MadrasahStatus,
  RestoreMadrasahResult,
} from "./madrasah.repository.interface";
import { NO_POLICIES, planSettingsUpdate } from "./madrasah-settings";

/**
 * A medrese's "nazırs" in this API are its MEDRESE_BASMUDERRIS holders since
 * MDRS-134, which moved `madrasah_nazirs` into `role_assignments`. MDRS-144
 * renames the API; MDRS-136 adds the medrese nazırı proper.
 */
const NAZIR_ROLE = ASSIGNED_ROLES.MEDRESE_BASMUDERRIS;

/** The enrollment states that make someone a medrese's talebe (MDRS-133). */
const TALEBE_STATES = [EnrollmentStatus.ENROLLED, EnrollmentStatus.COMPLETED];

@Injectable()
export class MadrasahRepository {
  // Must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly impact: PassivationImpactRepository
  ) {}

  private get db() {
    return this.databaseService.db;
  }

  private withNazirsSelect() {
    return {
      madrasah: madrasahs,
      nazirIds: holderIdsOf(NAZIR_ROLE, sql`"madrasahs"."id"`),
    };
  }

  private toWithNazirs(row: {
    madrasah: IMadrasah;
    nazirIds: string[];
  }): IMadrasahWithNazirs {
    return { ...row.madrasah, nazirIds: row.nazirIds };
  }

  async findAll(limit: number, offset: number): Promise<IMadrasahWithNazirs[]> {
    const rows = await this.db
      .select(this.withNazirsSelect())
      .from(madrasahs)
      .where(isNull(madrasahs.archivedAt))
      .orderBy(asc(madrasahs.name), asc(madrasahs.id))
      .limit(limit)
      .offset(offset);
    return rows.map((r) => this.toWithNazirs(r));
  }

  async count(): Promise<number> {
    const [row] = await this.db
      .select({ value: sql<number>`count(*)`.mapWith(Number) })
      .from(madrasahs)
      .where(isNull(madrasahs.archivedAt));
    return row?.value ?? 0;
  }

  async findById(id: string): Promise<IMadrasahWithNazirs | null> {
    const rows = await this.db
      .select(this.withNazirsSelect())
      .from(madrasahs)
      .where(eq(madrasahs.id, id));
    return rows[0] ? this.toWithNazirs(rows[0]) : null;
  }

  async exists(id: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: madrasahs.id })
      .from(madrasahs)
      .where(eq(madrasahs.id, id))
      .limit(1);
    return rows.length > 0;
  }

  async handleTaken(handle: string, exceptId?: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: madrasahs.id })
      .from(madrasahs)
      .where(eq(madrasahs.handle, handle))
      .limit(1);
    return rows.length > 0 && rows[0].id !== exceptId;
  }

  async create(madrasah: ICreateMadrasah): Promise<IMadrasah> {
    const [created] = await this.db
      .insert(madrasahs)
      .values(madrasah)
      .returning();
    return created;
  }

  async update(id: string, updates: IUpdateMadrasah): Promise<boolean> {
    const updated = await this.db
      .update(madrasahs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(madrasahs.id, id))
      .returning({ id: madrasahs.id });
    return updated.length > 0;
  }

  /**
   * SYSTEM_ADMIN's delete. The medrese's role rows go explicitly — `scope_id`
   * is no foreign key — in the same transaction; its hosting rights cascade,
   * and its courses stay in their köşks with no medrese (`SET NULL`). Like
   * every real delete it leaves a `madrasah.delete` row in `audit_log` naming
   * who did it (MDRS-143); `false` when there is no such medrese.
   */
  async delete(id: string, actorId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [medrese] = await tx
        .select({ name: madrasahs.name, handle: madrasahs.handle })
        .from(madrasahs)
        .where(eq(madrasahs.id, id))
        .for("update");
      if (!medrese) return false;
      const courseCount = (
        await tx
          .select({ id: courses.id })
          .from(courses)
          .where(eq(courses.madrasahId, id))
      ).length;
      await tx.delete(madrasahs).where(eq(madrasahs.id, id));
      const nazirIds = await deleteAssignmentsIn(tx, SCOPE_TYPES.MADRASAH, [
        id,
      ]);
      await recordDeletion(tx, {
        actorId,
        entity: "madrasah",
        entityId: id,
        details: {
          name: medrese.name,
          handle: medrese.handle,
          nazirIds,
          // The courses are not deleted: they stay in their köşks, with no medrese.
          coursesKept: courseCount,
        },
      });
      return true;
    });
  }

  async isNazir(madrasahId: string, userId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: roleAssignments.id })
      .from(roleAssignments)
      .where(
        and(eq(roleAssignments.userId, userId), holdsIn(NAZIR_ROLE, madrasahId))
      )
      .limit(1);
    return rows.length > 0;
  }

  /** True when the medrese exists and is hidden (MDRS-170). */
  async isHidden(id: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: madrasahs.id })
      .from(madrasahs)
      .where(and(eq(madrasahs.id, id), isNotNull(madrasahs.archivedAt)))
      .limit(1);
    return rows.length > 0;
  }

  /**
   * Opens a medrese together with its başmüderris (MDRS-170): one transaction,
   * so a medrese never exists without the person who heads it, and the audit
   * row exists exactly when it does.
   */
  async createWithHead(
    input: ICreateMadrasahWithHead,
    actorId: string
  ): Promise<IMadrasah> {
    const { headMuderrisUserId, ...madrasah } = input;
    return this.db.transaction(async (tx) => {
      const [created] = await tx.insert(madrasahs).values(madrasah).returning();
      await grantRole(tx, {
        userId: headMuderrisUserId,
        role: NAZIR_ROLE,
        scopeId: created.id,
        grantedBy: actorId,
      });
      await tx.insert(auditLog).values({
        actorId,
        action: "madrasah.create",
        entity: "madrasah",
        entityId: created.id,
        details: {
          name: created.name,
          handle: created.handle,
          headMuderrisUserId,
        },
      });
      return created;
    });
  }

  /**
   * What the medrese's sitting başmüderris(ler) handed on that is still held:
   * nazır roles and permission grants in this medrese's scope, `granted_by` one
   * of them (nizam/22). `exceptUserId` leaves out the person who is about to
   * head the medrese themselves.
   */
  /** Names for the people a screen lists, from the users table. */
  async people(ids: string[]): Promise<
    Map<
      string,
      {
        id: string;
        givenName: string | null;
        familyName: string | null;
        email: string | null;
      }
    >
  > {
    const result = new Map<
      string,
      {
        id: string;
        givenName: string | null;
        familyName: string | null;
        email: string | null;
      }
    >();
    if (ids.length === 0) return result;
    const rows = await this.db
      .select({
        id: users.id,
        givenName: users.givenName,
        familyName: users.familyName,
        email: users.email,
      })
      .from(users)
      .where(inArray(users.id, ids));
    for (const row of rows) result.set(row.id, row);
    return result;
  }

  async headDelegations(
    madrasahId: string,
    exceptUserId?: string,
    db: Tx | DatabaseService["db"] = this.db
  ): Promise<IHeadDelegation[]> {
    const heads = (
      await db
        .select({ userId: roleAssignments.userId })
        .from(roleAssignments)
        .where(holdsIn(NAZIR_ROLE, madrasahId))
    ).map((h) => h.userId);
    if (heads.length === 0) return [];
    const roles = await db
      .select({
        id: roleAssignments.id,
        userId: roleAssignments.userId,
        role: roleAssignments.role,
        grantedAt: roleAssignments.createdAt,
        expiresAt: roleAssignments.expiresAt,
      })
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.scopeType, SCOPE_TYPES.MADRASAH),
          eq(roleAssignments.scopeId, madrasahId),
          inArray(roleAssignments.grantedBy, heads),
          eq(roleAssignments.role, ASSIGNED_ROLES.MEDRESE_NAZIR),
          isHeld()
        )
      )
      .orderBy(asc(roleAssignments.createdAt), asc(roleAssignments.id));
    const grants = await db
      .select({
        id: permissionGrants.id,
        userId: permissionGrants.userId,
        permission: permissionGrants.permission,
        groupId: permissionGrants.groupId,
        groupName: permissionGroups.name,
        grantedAt: permissionGrants.createdAt,
        expiresAt: permissionGrants.expiresAt,
      })
      .from(permissionGrants)
      .leftJoin(
        permissionGroups,
        eq(permissionGroups.id, permissionGrants.groupId)
      )
      .where(
        and(
          eq(permissionGrants.scopeType, SCOPE_TYPES.MADRASAH),
          eq(permissionGrants.scopeId, madrasahId),
          inArray(permissionGrants.grantedBy, heads),
          grantHeld()
        )
      )
      .orderBy(asc(permissionGrants.createdAt), asc(permissionGrants.id));
    const rows: IHeadDelegation[] = [
      ...roles.map((r) => ({
        kind: "ROLE" as const,
        id: r.id,
        userId: r.userId,
        role: r.role as string,
        permission: null,
        groupName: null,
        grantedAt: r.grantedAt,
        expiresAt: r.expiresAt,
      })),
      ...grants.map((g) => ({
        kind: "GRANT" as const,
        id: g.id,
        userId: g.userId,
        role: null,
        permission: g.permission,
        groupName: g.groupName,
        grantedAt: g.grantedAt,
        expiresAt: g.expiresAt,
      })),
    ];
    return rows.filter((r) => r.userId !== exceptUserId);
  }

  /**
   * Makes `userId` the medrese's only başmüderris (MDRS-170): the others'
   * grants are revoked in the actor's name, not deleted, and a passive medrese
   * is active again — that is what "bir başmüderris atadığınızda yeniden açılır"
   * means. Locks the medrese first, like `addNazir`. False when there is none.
   *
   * MDRS-172 (nizam/22): the outgoing başmüderris's hand-ons are decided here,
   * one answer each — TAKE_OVER keeps the right under the actor's name, DROP
   * revokes it — and a change that leaves any unanswered is refused whole
   * (DismissDecisionsError). Appointing whoever already heads it asks nothing.
   * `endsAt` is the new başmüderris's "Görev bitişi".
   */
  async setHeadMuderris(
    madrasahId: string,
    userId: string,
    actorId: string,
    options: {
      endsAt?: Date | null;
      decisions?: Array<{
        kind: "ROLE" | "GRANT";
        id: string;
        action: "TAKE_OVER" | "DROP";
      }>;
    } = {}
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [madrasah] = await tx
        .select({ id: madrasahs.id })
        .from(madrasahs)
        .where(eq(madrasahs.id, madrasahId))
        .for("no key update");
      if (!madrasah) return false;
      const held = await tx
        .select({ userId: roleAssignments.userId })
        .from(roleAssignments)
        .where(holdsIn(NAZIR_ROLE, madrasahId));
      const previous = held.map((h) => h.userId);
      const replacing = previous.some((id) => id !== userId);

      let tookOver = 0;
      let dropped = 0;
      if (replacing) {
        const given = await this.headDelegations(madrasahId, userId, tx);
        const key = (kind: string, id: string) => `${kind}:${id}`;
        const decisions = options.decisions ?? [];
        const decided = new Map(decisions.map((d) => [key(d.kind, d.id), d]));
        const complete =
          decided.size === decisions.length &&
          decided.size === given.length &&
          given.every((g) => decided.has(key(g.kind, g.id)));
        if (!complete) throw new DismissDecisionsError();
        for (const item of given) {
          const take =
            decided.get(key(item.kind, item.id))?.action === "TAKE_OVER";
          const change = take
            ? { grantedBy: actorId }
            : { revokedAt: sql`now()`, revokedBy: actorId };
          if (take) tookOver += 1;
          else dropped += 1;
          if (item.kind === "ROLE") {
            await tx
              .update(roleAssignments)
              .set(change)
              .where(eq(roleAssignments.id, item.id));
          } else {
            await tx
              .update(permissionGrants)
              .set(change)
              .where(eq(permissionGrants.id, item.id));
          }
        }
      }

      for (const other of previous.filter((id) => id !== userId)) {
        await revokeRole(tx, {
          userId: other,
          role: NAZIR_ROLE,
          scopeId: madrasahId,
          revokedBy: actorId,
        });
      }
      await grantRole(tx, {
        userId,
        role: NAZIR_ROLE,
        scopeId: madrasahId,
        grantedBy: actorId,
        expiresAt: options.endsAt ?? null,
      });
      await tx
        .update(madrasahs)
        .set({
          passiveSince: null,
          passiveReason: null,
          updatedAt: new Date(),
        })
        .where(eq(madrasahs.id, madrasahId));
      await tx.insert(auditLog).values({
        actorId,
        action: "madrasah.head_muderris.set",
        entity: "madrasah",
        entityId: madrasahId,
        details: {
          headMuderrisUserId: userId,
          previous,
          endsAt: options.endsAt?.toISOString() ?? null,
          tookOver,
          dropped,
        },
      });
      return true;
    });
  }

  /**
   * Hides the medrese (nazir/12 "Medreseyi gizle") together with its courses,
   * in one transaction with an audit row. The courses that were shown get the
   * medrese's own instant, which is how `restore` finds them again: one hidden
   * on its own earlier stays hidden. Nothing is deleted. `level` is the level
   * the hider acted at (MDRS-135); the courses carry it too.
   */
  async hide(
    madrasahId: string,
    actorId: string,
    level: HideLevel
  ): Promise<HideMadrasahResult> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ name: madrasahs.name, archivedAt: madrasahs.archivedAt })
        .from(madrasahs)
        .where(eq(madrasahs.id, madrasahId))
        .for("no key update");
      if (!row) return "not-found";
      if (row.archivedAt !== null) return "already-hidden";
      const { name } = row;
      const now = new Date();
      await tx
        .update(madrasahs)
        .set({
          archivedAt: now,
          archivedBy: actorId,
          archivedLevel: level,
          updatedAt: now,
        })
        .where(eq(madrasahs.id, madrasahId));
      // The courses go with it, and are brought back by the same level.
      const hidden = await tx
        .update(courses)
        .set({
          archivedAt: now,
          archivedBy: actorId,
          archivedLevel: level,
          version: sql`${courses.version} + 1`,
          updatedAt: now,
        })
        .where(
          and(eq(courses.madrasahId, madrasahId), isNull(courses.archivedAt))
        )
        .returning({ id: courses.id });
      await recordHide(tx, {
        actorId,
        verb: "hide",
        entity: "madrasah",
        entityId: madrasahId,
        title: name,
        level,
        madrasahId,
        extra: { courses: hidden.length },
      });
      return "hidden";
    });
  }

  /**
   * "Medreseyi pasife al" (MDRS-227): the medrese is passive and its held
   * başmüderris is taken off the post, in one transaction with the audit row
   * naming them and the impact the person confirmed. Locks the medrese first,
   * like `setHeadMuderris`, and measures the impact again under the lock: a
   * `confirmation` that is not for these numbers and this caller throws
   * `PassivationImpactChangedError` and nothing is written. The medrese's
   * nazırları and every grant stay; a başmüderris appointed later opens it again.
   */
  async deactivate(
    madrasahId: string,
    actorId: string,
    confirmation: string
  ): Promise<DeactivateMadrasahResult> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ name: madrasahs.name, passiveSince: madrasahs.passiveSince })
        .from(madrasahs)
        .where(eq(madrasahs.id, madrasahId))
        .for("no key update");
      if (!row) return "not-found";
      if (row.passiveSince !== null) return "already-passive";
      const impact = await this.impact.confirmed(
        tx,
        { type: "MADRASAH", id: madrasahId },
        actorId,
        confirmation
      );
      const held = await tx
        .select({ userId: roleAssignments.userId })
        .from(roleAssignments)
        .where(holdsIn(NAZIR_ROLE, madrasahId));
      for (const { userId } of held) {
        await revokeRole(tx, {
          userId,
          role: NAZIR_ROLE,
          scopeId: madrasahId,
          revokedBy: actorId,
        });
      }
      const now = new Date();
      await tx
        .update(madrasahs)
        .set({
          passiveSince: now,
          passiveReason: "DEACTIVATED_BY_ADMIN",
          updatedAt: now,
        })
        .where(eq(madrasahs.id, madrasahId));
      await tx.insert(auditLog).values({
        actorId,
        action: "madrasah.deactivate",
        entity: "madrasah",
        entityId: madrasahId,
        details: {
          name: row.name,
          removedHeadIds: held.map((h) => h.userId),
          impact: auditImpactOf(impact),
          confirmation,
        },
      });
      return "deactivated";
    });
  }

  /**
   * Brings a hidden medrese back (nizam/07 "Geri al"), with an audit row. The
   * courses `hide` took with it come back too.
   */
  async restore(
    madrasahId: string,
    actorId: string,
    level: HideLevel
  ): Promise<RestoreMadrasahResult> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          name: madrasahs.name,
          archivedAt: madrasahs.archivedAt,
          archivedLevel: madrasahs.archivedLevel,
        })
        .from(madrasahs)
        .where(eq(madrasahs.id, madrasahId))
        .for("no key update");
      if (!row) return "not-found";
      if (row.archivedAt === null) return "not-hidden";
      // By the level that hid it or one above (MDRS-135, the ban rule); a
      // medrese hidden before the level was recorded counts as hidden by the
      // medrese itself.
      const hiddenAt = hiderLevelOf({
        type: "madrasah",
        madrasahId,
        archivedLevel: row.archivedLevel,
      });
      if (!mayRestoreAt(level, hiddenAt)) {
        throw new ArchiveRestoreLevelError(hiddenAt, level);
      }
      const now = new Date();
      await tx
        .update(madrasahs)
        .set({
          archivedAt: null,
          archivedBy: null,
          archivedLevel: null,
          updatedAt: now,
        })
        .where(eq(madrasahs.id, madrasahId));
      const shown = await tx
        .update(courses)
        .set({
          archivedAt: null,
          archivedBy: null,
          archivedLevel: null,
          version: sql`${courses.version} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(courses.madrasahId, madrasahId),
            eq(courses.archivedAt, row.archivedAt)
          )
        )
        .returning({ id: courses.id });
      await recordHide(tx, {
        actorId,
        verb: "restore",
        entity: "madrasah",
        entityId: madrasahId,
        title: row.name,
        level,
        hiddenLevel: hiddenAt,
        madrasahId,
        extra: {
          hiddenSince: row.archivedAt.toISOString(),
          courses: shown.length,
        },
      });
      return "restored";
    });
  }

  /**
   * SQL for the status a row is in. Hidden wins over passive: someone hid the
   * medrese, which says more than that nobody attends it.
   */
  private statusSql() {
    return sql`case when m.archived_at is not null then 'HIDDEN'
      when m.passive_since is not null then 'PASSIVE' else 'ACTIVE' end`;
  }

  /**
   * One page of nizam/07's table — every medrese, hidden and passive ones
   * included — with its başmüderris, course count and hosting köşks. One
   * statement with correlated subqueries, so a page of 25 is one round trip
   * rather than 75.
   */
  async findDirectory(
    filter: IMadrasahDirectoryFilter,
    limit: number,
    offset: number
  ): Promise<{ items: IMadrasahDirectoryItem[]; total: number }> {
    const where = this.directoryWhere(filter);
    const items = await this.queryDirectory(
      where,
      sql`limit ${limit} offset ${offset}`
    );
    const [count] = (
      await this.db.execute<{ total: string }>(
        sql`select count(*) as total from madrasahs m ${where}`
      )
    ).rows;
    return { items, total: Number(count?.total ?? 0) };
  }

  async findDirectoryItem(id: string): Promise<IMadrasahDirectoryItem | null> {
    const rows = await this.queryDirectory(sql`where m.id = ${id}`, sql``);
    return rows[0] ?? null;
  }

  private directoryWhere(filter: IMadrasahDirectoryFilter) {
    const parts: SQL[] = [];
    if (filter.status !== "ALL") {
      parts.push(sql`(${this.statusSql()}) = ${filter.status}`);
    }
    const q = filter.q?.trim();
    if (q) {
      const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
      parts.push(
        sql`(m.name ilike ${like} or m.handle ilike ${like} or exists (
          select 1 from role_assignments ra join users u on u.id = ra.user_id
           where ra.scope_id = m.id and ra.role = ${NAZIR_ROLE}
             and ra.revoked_at is null
             and (ra.expires_at is null or ra.expires_at > now())
             and concat_ws(' ', u.given_name, u.family_name) ilike ${like}))`
      );
    }
    return parts.length === 0
      ? sql``
      : sql`where ${sql.join(parts, sql` and `)}`;
  }

  private async queryDirectory(
    where: SQL,
    page: SQL
  ): Promise<IMadrasahDirectoryItem[]> {
    const result = await this.db.execute<{
      id: string;
      handle: string;
      name: string;
      cover_hue: number;
      status: MadrasahStatus;
      since: Date | string | null;
      hidden_level: HideLevel | null;
      head_id: string | null;
      head_name: string | null;
      course_count: string;
      hosting: { id: string; name: string }[];
    }>(sql`
      select m.id, m.handle, m.name, m.cover_hue,
             ${this.statusSql()} as status,
             coalesce(m.archived_at, m.passive_since) as since,
             case when m.archived_at is not null
                  then coalesce(m.archived_level::text, 'madrasah') end as hidden_level,
             h.user_id as head_id,
             nullif(trim(concat_ws(' ', u.given_name, u.family_name)), '') as head_name,
             (select count(*) from courses c
               where c.madrasah_id = m.id and c.archived_at is null) as course_count,
             coalesce((select json_agg(json_build_object('id', k.id, 'name', k.name)
                                       order by k.name, k.id)
                         from madrasah_kosk_hosting hr
                         join kosks k on k.id = hr.kosk_id
                        where hr.madrasah_id = m.id and hr.revoked_at is null
                          and k.archived_at is null), '[]'::json) as hosting
        from madrasahs m
        left join lateral (
          select ra.user_id from role_assignments ra
           where ra.scope_id = m.id and ra.role = ${NAZIR_ROLE}
             and ra.revoked_at is null
             and (ra.expires_at is null or ra.expires_at > now())
           order by ra.created_at, ra.user_id limit 1) h on true
        left join users u on u.id = h.user_id
        ${where}
       order by m.name, m.id
       ${page}`);
    return result.rows.map((r) => ({
      id: r.id,
      handle: r.handle,
      name: r.name,
      coverHue: r.cover_hue,
      status: r.status,
      // A raw `execute` skips drizzle's column mappers: timestamps arrive as text.
      since: r.since ? new Date(r.since) : null,
      hiddenLevel: r.hidden_level,
      headMuderris: r.head_id ? { id: r.head_id, name: r.head_name } : null,
      courseCount: Number(r.course_count),
      hostingKosks: r.hosting,
    }));
  }

  async statusCounts(): Promise<IMadrasahStatusCounts> {
    const [row] = (
      await this.db.execute<{
        total: string;
        active: string;
        passive: string;
        hidden: string;
      }>(sql`
        select count(*) as total,
               count(*) filter (where m.archived_at is null and m.passive_since is null) as active,
               count(*) filter (where m.archived_at is null and m.passive_since is not null) as passive,
               count(*) filter (where m.archived_at is not null) as hidden
          from madrasahs m`)
    ).rows;
    return {
      all: Number(row?.total ?? 0),
      active: Number(row?.active ?? 0),
      passive: Number(row?.passive ?? 0),
      hidden: Number(row?.hidden ?? 0),
    };
  }

  /** The passive medreses the warning on nizam/07 names, oldest first. */
  async findPassive(): Promise<IPassiveMadrasah[]> {
    const rows = await this.db
      .select({
        id: madrasahs.id,
        name: madrasahs.name,
        since: madrasahs.passiveSince,
      })
      .from(madrasahs)
      .where(
        and(isNull(madrasahs.archivedAt), isNotNull(madrasahs.passiveSince))
      )
      .orderBy(asc(madrasahs.passiveSince), asc(madrasahs.id));
    return rows.flatMap((r) =>
      r.since ? [{ id: r.id, name: r.name, since: r.since }] : []
    );
  }

  /**
   * The medrese's talebe (MDRS-133, MDRS-134): everyone with an ENROLLED or
   * COMPLETED enrollment in one of its courses. Derived on every read, never
   * stored, so it cannot drift from the enrollments it comes from.
   */
  async findTalebeIds(madrasahId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ userId: enrollments.userId })
      .from(enrollments)
      .innerJoin(courses, eq(courses.id, enrollments.courseId))
      .where(
        and(
          eq(courses.madrasahId, madrasahId),
          inArray(enrollments.status, TALEBE_STATES)
        )
      )
      .orderBy(enrollments.userId);
    return rows.map((r) => r.userId);
  }

  /**
   * The medreses Keşfet lists (MDRS-159), each with its listed courses and its
   * başmüderris. A course is listed when it is published, not hidden, and in a
   * köşk the public list holds. `level` and `field` keep the medreses that have
   * a listed course in a köşk of that level or ilim alanı (a medrese has no
   * level of its own); `q` matches the medrese's name, handle or description,
   * or the name of its başmüderris. Not paginated: there are few medreses, and
   * the filters run over the whole set.
   */
  async findExplore({
    q,
    level,
    field,
    madrasahId,
  }: IMadrasahExploreFilter = {}): Promise<IMadrasahExplore[]> {
    const rows = await this.db
      .select()
      .from(madrasahs)
      .where(madrasahId ? eq(madrasahs.id, madrasahId) : undefined)
      .orderBy(asc(madrasahs.name), asc(madrasahs.id));
    if (rows.length === 0) return [];
    const ids = rows.map((m) => m.id);

    const [courseRows, heads] = await Promise.all([
      this.db
        .select({
          id: courses.id,
          title: courses.title,
          coverHue: courses.coverHue,
          madrasahId: courses.madrasahId,
          koskLevel: kosks.level,
          koskField: kosks.field,
        })
        .from(courses)
        .innerJoin(kosks, eq(kosks.id, courses.koskId))
        .where(
          and(
            inArray(courses.madrasahId, ids),
            eq(courses.status, CourseStatus.PUBLISHED),
            isNull(courses.archivedAt),
            eq(kosks.isPrivate, false),
            isNull(kosks.archivedAt)
          )
        )
        .orderBy(asc(courses.title), asc(courses.id)),
      this.headMuderrisNames(ids),
    ]);

    const words = (q ?? "")
      .toLocaleLowerCase("tr")
      .split(/\s+/)
      .filter(Boolean);
    const result: IMadrasahExplore[] = [];
    for (const m of rows) {
      const own = courseRows.filter((c) => c.madrasahId === m.id);
      if (level && !own.some((c) => c.koskLevel === level)) continue;
      if (field && !own.some((c) => c.koskField === field)) continue;
      const headMuderrisName = heads.get(m.id) ?? null;
      const haystack = [m.name, m.handle, m.description, headMuderrisName]
        .join(" ")
        .toLocaleLowerCase("tr");
      if (!words.every((w) => haystack.includes(w))) continue;
      result.push({
        id: m.id,
        handle: m.handle,
        name: m.name,
        headMuderrisName,
        courseCount: own.length,
        courses: own.map((c) => ({
          id: c.id,
          title: c.title,
          coverHue: c.coverHue,
        })),
      });
    }
    return result;
  }

  /** The oldest held başmüderris grant of each medrese, as a display name. */
  private async headMuderrisNames(ids: string[]): Promise<Map<string, string>> {
    const grants = await this.db
      .select({
        scopeId: roleAssignments.scopeId,
        userId: roleAssignments.userId,
      })
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.role, NAZIR_ROLE),
          inArray(roleAssignments.scopeId, ids),
          isHeld()
        )
      )
      .orderBy(asc(roleAssignments.createdAt), asc(roleAssignments.userId));
    const firstByScope = new Map<string, string>();
    for (const g of grants) {
      if (g.scopeId && !firstByScope.has(g.scopeId)) {
        firstByScope.set(g.scopeId, g.userId);
      }
    }
    if (firstByScope.size === 0) return new Map();
    const people = await this.db
      .select({
        id: users.id,
        given: users.givenName,
        family: users.familyName,
      })
      .from(users)
      .where(inArray(users.id, [...new Set(firstByScope.values())]));
    const nameOf = new Map(
      people.map((p) => [p.id, [p.given, p.family].filter(Boolean).join(" ")])
    );
    const names = new Map<string, string>();
    for (const [scopeId, userId] of firstByScope) {
      const name = nameOf.get(userId);
      if (name) names.set(scopeId, name);
    }
    return names;
  }

  /**
   * What the medrese page shows (MDRS-157): the live, published courses of the
   * medrese in listed, shown köşks — an unlisted köşk is in no list (MDRS-122)
   * and a hidden one closes its courses (MDRS-143) — each
   * with its müderrisler, the caller's enrollment and the next session; the
   * köşks those courses are in; and the başmüderris. Four small reads over the
   * course ids rather than one wide join, so a course with many müderrisler or
   * sessions does not multiply rows.
   */
  async findOverview(
    madrasahId: string,
    userId: string | null
  ): Promise<IMadrasahOverview> {
    const courseRows = await this.db
      .select({
        id: courses.id,
        title: courses.title,
        category: courses.category,
        coverHue: courses.coverHue,
        koskId: courses.koskId,
        koskName: kosks.name,
      })
      .from(courses)
      .innerJoin(kosks, eq(kosks.id, courses.koskId))
      .where(
        and(
          eq(courses.madrasahId, madrasahId),
          eq(courses.status, CourseStatus.PUBLISHED),
          isNull(courses.archivedAt),
          isNull(kosks.archivedAt),
          eq(kosks.isPrivate, false)
        )
      )
      .orderBy(asc(courses.title), asc(courses.id));
    const ids = courseRows.map((c) => c.id);

    const [muderrisRows, enrollmentRows, sessionRows, headId] =
      await Promise.all([
        this.muderrisOf(ids),
        this.enrollmentsOf(ids, userId),
        this.nextSessionsOf(ids),
        this.firstHeadMuderrisId(madrasahId),
      ]);

    const muderrisByCourse = new Map<string, typeof muderrisRows>();
    for (const m of muderrisRows) {
      const list = muderrisByCourse.get(m.courseId) ?? [];
      list.push(m);
      muderrisByCourse.set(m.courseId, list);
    }
    const statusByCourse = new Map(
      enrollmentRows.map((e) => [e.courseId, e.status])
    );
    const nextByCourse = new Map(sessionRows.map((s) => [s.courseId, s.next]));

    const result: IMadrasahCourse[] = courseRows.map((c) => ({
      ...c,
      muderris: (muderrisByCourse.get(c.id) ?? []).map((m) => ({
        name: m.name,
        title: m.title,
        isImam: m.isImam,
      })),
      enrollmentStatus: statusByCourse.get(c.id) ?? null,
      nextSessionAt: nextByCourse.get(c.id) ?? null,
    }));

    const kosksSeen = new Map<string, string>();
    for (const c of courseRows) kosksSeen.set(c.koskId, c.koskName);

    let headMuderris: IMadrasahHeadMuderris | null = null;
    if (headId) {
      const [user] = await this.db
        .select({ given: users.givenName, family: users.familyName })
        .from(users)
        .where(eq(users.id, headId))
        .limit(1);
      const name = [user?.given, user?.family].filter(Boolean).join(" ");
      headMuderris = {
        id: headId,
        name: name || null,
        courseCount: new Set(
          muderrisRows.filter((m) => m.userId === headId).map((m) => m.courseId)
        ).size,
      };
    }

    return {
      headMuderris,
      courses: result,
      kosks: [...kosksSeen].map(([id, name]) => ({ id, name })),
    };
  }

  private async muderrisOf(ids: string[]): Promise<
    {
      courseId: string;
      userId: string | null;
      name: string;
      title: string | null;
      isImam: boolean;
    }[]
  > {
    if (ids.length === 0) return [];
    const [rows, imams] = await Promise.all([
      this.db
        .select({
          courseId: courseMuderris.courseId,
          userId: courseMuderris.userId,
          name: courseMuderris.name,
          title: courseMuderris.title,
        })
        .from(courseMuderris)
        .where(inArray(courseMuderris.courseId, ids))
        .orderBy(asc(courseMuderris.orderIndex), asc(courseMuderris.id)),
      this.db
        .select({
          courseId: roleAssignments.scopeId,
          userId: roleAssignments.userId,
        })
        .from(roleAssignments)
        .where(
          and(
            eq(roleAssignments.role, ASSIGNED_ROLES.MUDERRIS),
            eq(roleAssignments.isImam, true),
            inArray(roleAssignments.scopeId, ids),
            isHeld()
          )
        ),
    ]);
    const imamKeys = new Set(imams.map((i) => `${i.courseId}:${i.userId}`));
    return rows.map((r) => ({
      ...r,
      isImam: r.userId !== null && imamKeys.has(`${r.courseId}:${r.userId}`),
    }));
  }

  private async enrollmentsOf(
    ids: string[],
    userId: string | null
  ): Promise<
    {
      courseId: string;
      status:
        | EnrollmentStatus.PENDING
        | EnrollmentStatus.ENROLLED
        | EnrollmentStatus.COMPLETED;
    }[]
  > {
    if (ids.length === 0 || userId === null) return [];
    // A seat the course team revoked shows no badge on the card (MDRS-161).
    const rows = await this.db
      .select({ courseId: enrollments.courseId, status: enrollments.status })
      .from(enrollments)
      .where(
        and(eq(enrollments.userId, userId), inArray(enrollments.courseId, ids))
      );
    return rows.flatMap((r) =>
      r.status === EnrollmentStatus.REVOKED
        ? []
        : [{ courseId: r.courseId, status: r.status }]
    );
  }

  /**
   * The counts behind the nazır portal's menu badges (MDRS-183): the PENDING
   * enrollments across the medrese's courses, and how many courses hold one.
   * A hidden course is left out, as `findPendingByKosk` leaves it out of the
   * köşk's list (MDRS-124). The aggregate has no GROUP BY, so it always
   * returns one row; the fallback only satisfies the type.
   */
  async getBadgeCounts(madrasahId: string): Promise<IMadrasahBadgeCounts> {
    const [row] = await this.db
      .select({
        pendingApplications: sql<number>`count(*)`.mapWith(Number),
        coursesWithPendingApplications:
          sql<number>`count(distinct ${enrollments.courseId})`.mapWith(Number),
      })
      .from(enrollments)
      .innerJoin(courses, eq(courses.id, enrollments.courseId))
      .where(
        and(
          eq(courses.madrasahId, madrasahId),
          isNull(courses.archivedAt),
          eq(enrollments.status, EnrollmentStatus.PENDING)
        )
      );
    return {
      pendingApplications: row?.pendingApplications ?? 0,
      coursesWithPendingApplications: row?.coursesWithPendingApplications ?? 0,
    };
  }

  /**
   * The settings screen's read (nazir/04): the medrese row, its policies (all
   * off until the first save) and who saved last. Null when there is no such
   * medrese.
   */
  async getSettings(id: string): Promise<IMadrasahSettings | null> {
    const [row] = await this.db
      .select({
        name: madrasahs.name,
        description: madrasahs.description,
        closedCourseRequired: madrasahSettings.policyClosedCourseRequired,
        alwaysApproval: madrasahSettings.policyAlwaysApproval,
        noPublicRecordings: madrasahSettings.policyNoPublicRecordings,
        updatedAt: madrasahSettings.updatedAt,
        updatedBy: madrasahSettings.updatedBy,
        givenName: users.givenName,
        familyName: users.familyName,
        email: users.email,
      })
      .from(madrasahs)
      .leftJoin(madrasahSettings, eq(madrasahSettings.madrasahId, madrasahs.id))
      .leftJoin(users, eq(users.id, madrasahSettings.updatedBy))
      .where(eq(madrasahs.id, id))
      .limit(1);
    if (!row) return null;
    const name = [row.givenName, row.familyName].filter(Boolean).join(" ");
    return {
      name: row.name,
      description: row.description,
      policies: {
        closedCourseRequired: row.closedCourseRequired ?? false,
        alwaysApproval: row.alwaysApproval ?? false,
        noPublicRecordings: row.noPublicRecordings ?? false,
      },
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy
        ? { id: row.updatedBy, name: name || null, email: row.email }
        : null,
    };
  }

  /**
   * Saves nazir/04 in one transaction with its audit row: the name and
   * description on the medrese row, the policies and the "Son değişiklik"
   * stamp on `madrasah_settings`. The medrese row is locked first, so two
   * saves cannot both diff against the same old values. A save that changes
   * nothing writes nothing. False when there is no such medrese.
   */
  async updateSettings(
    id: string,
    patch: IUpdateMadrasahSettings,
    actorId: string
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          name: madrasahs.name,
          description: madrasahs.description,
          closedCourseRequired: madrasahSettings.policyClosedCourseRequired,
          alwaysApproval: madrasahSettings.policyAlwaysApproval,
          noPublicRecordings: madrasahSettings.policyNoPublicRecordings,
        })
        .from(madrasahs)
        .leftJoin(
          madrasahSettings,
          eq(madrasahSettings.madrasahId, madrasahs.id)
        )
        .where(eq(madrasahs.id, id))
        .for("update", { of: madrasahs });
      if (!row) return false;

      const { next, changes } = planSettingsUpdate(
        {
          name: row.name,
          description: row.description,
          policies: {
            closedCourseRequired:
              row.closedCourseRequired ?? NO_POLICIES.closedCourseRequired,
            alwaysApproval: row.alwaysApproval ?? NO_POLICIES.alwaysApproval,
            noPublicRecordings:
              row.noPublicRecordings ?? NO_POLICIES.noPublicRecordings,
          },
        },
        patch
      );
      if (Object.keys(changes).length === 0) return true;

      if ("name" in changes || "description" in changes) {
        await tx
          .update(madrasahs)
          .set({
            name: next.name,
            description: next.description,
            updatedAt: new Date(),
          })
          .where(eq(madrasahs.id, id));
      }
      const stamp = {
        policyClosedCourseRequired: next.policies.closedCourseRequired,
        policyAlwaysApproval: next.policies.alwaysApproval,
        policyNoPublicRecordings: next.policies.noPublicRecordings,
        updatedAt: sql`now()`,
        updatedBy: actorId,
      };
      await tx
        .insert(madrasahSettings)
        .values({ madrasahId: id, ...stamp })
        .onConflictDoUpdate({
          target: madrasahSettings.madrasahId,
          set: stamp,
        });
      await tx.insert(auditLog).values({
        actorId,
        action: "madrasah.settings.update",
        entity: "madrasah",
        entityId: id,
        details: { changes },
      });
      return true;
    });
  }

  /**
   * The medrese's courses for the nazırs' screens (nazir/04's "Politikaların
   * uygulandığı dersler", nazir/07's table): drafts and published ones, a
   * hidden one not, by title, with the talebe and the müderrisler. The köşk
   * can be unlisted — this is the nazırs' own view, not the public page's —
   * but not hidden: a hidden köşk closes its courses to a medrese, which is not
   * above it (MDRS-143).
   */
  async findCourseList(
    madrasahId: string,
    filter: IMadrasahCourseFilter = {}
  ): Promise<IMadrasahCourseListItem[]> {
    const rows = await this.db
      .select({
        id: courses.id,
        title: courses.title,
        koskId: courses.koskId,
        koskName: kosks.name,
        status: courses.status,
        requiresApproval: courses.requiresApproval,
        closed: courses.isClosed,
        createdAt: courses.createdAt,
      })
      .from(courses)
      .innerJoin(kosks, eq(kosks.id, courses.koskId))
      .where(
        and(
          eq(courses.madrasahId, madrasahId),
          isNull(courses.archivedAt),
          isNull(kosks.archivedAt),
          filter.koskId ? eq(courses.koskId, filter.koskId) : undefined,
          filter.status ? eq(courses.status, filter.status) : undefined,
          filter.courseId ? eq(courses.id, filter.courseId) : undefined
        )
      )
      .orderBy(asc(courses.title), asc(courses.id));
    const ids = rows.map((r) => r.id);
    const [muderris, counts] = await Promise.all([
      this.muderrisOf(ids),
      this.enrollmentCountsOf(ids),
    ]);
    const emails = await this.emailsOf(
      muderris.flatMap((m) => (m.userId ? [m.userId] : []))
    );
    return rows.map((r) => ({
      ...r,
      status: r.status as CourseStatus,
      studentCount: counts.get(r.id)?.students ?? 0,
      pendingCount: counts.get(r.id)?.pending ?? 0,
      muderris: muderris
        .filter((m) => m.courseId === r.id)
        .map((m) => ({
          userId: m.userId,
          name: m.name,
          title: m.title,
          email: m.userId ? (emails.get(m.userId) ?? null) : null,
          isImam: m.isImam,
        })),
    }));
  }

  /**
   * Each course's enrolled talebe and its pending applications. A completed
   * enrollment is neither, as in the hosting and archive counts, so the number
   * nazir/18 names is the one the archive then shows.
   */
  private async enrollmentCountsOf(
    ids: string[]
  ): Promise<Map<string, { students: number; pending: number }>> {
    const result = new Map<string, { students: number; pending: number }>();
    if (ids.length === 0) return result;
    const rows = await this.db
      .select({
        courseId: enrollments.courseId,
        status: enrollments.status,
        n: sql<number>`count(*)`.mapWith(Number),
      })
      .from(enrollments)
      .where(inArray(enrollments.courseId, ids))
      .groupBy(enrollments.courseId, enrollments.status);
    for (const row of rows) {
      const counts = result.get(row.courseId) ?? { students: 0, pending: 0 };
      if (row.status === EnrollmentStatus.ENROLLED) counts.students += row.n;
      else if (row.status === EnrollmentStatus.PENDING) counts.pending += row.n;
      result.set(row.courseId, counts);
    }
    return result;
  }

  private async emailsOf(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(inArray(users.id, userIds));
    return new Map(rows.flatMap((r) => (r.email ? [[r.id, r.email]] : [])));
  }

  /** The earliest session still ahead, per course; archived ones do not count. */
  private async nextSessionsOf(
    ids: string[]
  ): Promise<{ courseId: string; next: Date | null }[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({
        courseId: courseWeeks.courseId,
        next: min(lessons.scheduledAt),
      })
      .from(lessons)
      .innerJoin(courseWeeks, eq(courseWeeks.id, lessons.weekId))
      .where(
        and(
          inArray(courseWeeks.courseId, ids),
          isNull(courseWeeks.archivedAt),
          isNull(lessons.archivedAt),
          gt(lessons.scheduledAt, sql`now()`)
        )
      )
      .groupBy(courseWeeks.courseId);
    return rows.map((r) => ({ courseId: r.courseId, next: r.next }));
  }

  /** The oldest held MEDRESE_BASMUDERRIS grant of the medrese, if any. */
  private async firstHeadMuderrisId(
    madrasahId: string
  ): Promise<string | null> {
    const rows = await this.db
      .select({ userId: roleAssignments.userId })
      .from(roleAssignments)
      .where(holdsIn(NAZIR_ROLE, madrasahId))
      .orderBy(asc(roleAssignments.createdAt), asc(roleAssignments.userId))
      .limit(1);
    return rows[0]?.userId ?? null;
  }
}
