import { Injectable } from "@nestjs/common";
import { and, eq, inArray, sql } from "drizzle-orm";
import { ArchiveRestoreLevelError } from "../archive/errors/archive-errors";
import { recordHide } from "../archive/hide-audit";
import {
  type HideLevel,
  hiderLevelOf,
  mayRestoreAt,
} from "../archive/hide-level";
import { Tx } from "../course/course-purge";
import { DatabaseService } from "../database/database.service";
import { grantRole, holdsIn, revokeRole } from "../database/role-assignments";
import { auditLog } from "../database/schema/audit.schema";
import { kosks } from "../database/schema/kosk.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
} from "../database/schema/role-assignment.schema";
import { users } from "../database/schema/user.schema";
import type {
  KoskListingFilter,
  KoskStatus,
  KoskStatusFilter,
} from "./dto/kosk-admin.dto";
import type { ICreateKosk, IKosk } from "./kosk.repository.interface";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NAZIM = ASSIGNED_ROLES.KOSK_NAZIM;

/** What narrows the başnazım's table (nizam/09). */
export interface IKoskDirectoryFilter {
  status: KoskStatusFilter;
  level?: string;
  field?: string;
  listing: KoskListingFilter;
  q?: string;
  /** A köşk nazımı sees only the köşks they manage. */
  managerId?: string;
  /** One köşk, by id. */
  id?: string;
}

export interface IKoskDirectoryRow {
  id: string;
  handle: string | null;
  name: string;
  coverHue: number;
  field: string | null;
  level: string | null;
  isPrivate: boolean;
  status: KoskStatus;
  since: Date | null;
  /** The level the köşk was hidden at; null while it is shown. A row hidden before it was recorded counts as the köşk's own. */
  hiddenLevel: HideLevel | null;
  nazimIds: string[];
  courseCount: number;
}

export interface IKoskOverviewRow {
  status: KoskStatus;
  since: Date | null;
  /** The level the köşk was hidden at; null while it is shown. */
  hiddenLevel: HideLevel | null;
  openedAt: Date;
  ownerId: string;
  courses: { all: number; published: number; draft: number; hidden: number };
  students: number;
  pendingApplications: number;
  nazimCount: number;
  hostingMadrasahs: { id: string; name: string }[];
}

export interface IKoskCourseRow {
  id: string;
  title: string;
  coverHue: number;
  weekCount: number;
  madrasah: { id: string; name: string } | null;
  status: "PUBLISHED" | "DRAFT" | "HIDDEN";
  hiddenAt: Date | null;
  createdAt: Date;
  muderris: { name: string; isImam: boolean }[];
  studentCount: number;
  pendingCount: number;
  bannedCount: number;
}

export interface IKoskDirectoryCounts {
  all: number;
  active: number;
  passive: number;
  hidden: number;
}

export interface IKoskNazimRow {
  userId: string;
  grantedBy: string;
  grantedAt: Date;
  endsAt: Date | null;
}

export interface IPersonRow {
  id: string;
  givenName: string | null;
  familyName: string | null;
  email: string | null;
}

export type HideOutcome = "hidden" | "no-kosk" | "already-hidden";
export type RestoreOutcome = "restored" | "no-kosk" | "not-hidden";
export type AddNazimsOutcome =
  | { status: "added" }
  | { status: "no-kosk" }
  | { status: "exists"; userIds: string[] };

/**
 * The reads and writes behind nizam/09, 10, 21, 24 and 25 (MDRS-174): the
 * başnazım's table of köşks, opening a köşk with its nazımları, hiding and
 * bringing one back, and who manages a köşk. Every write is one transaction
 * together with its `audit_log` row.
 */
@Injectable()
export class KoskAdminRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  // ---- the table -----------------------------------------------------------

  /** Hidden wins over passive: someone hid the köşk, which says more than that nobody attends it. */
  private statusSql() {
    return sql`case when k.archived_at is not null then 'HIDDEN'
      when k.passive_since is not null then 'PASSIVE' else 'ACTIVE' end`;
  }

  /** Held KOSK_NAZIM rows of the köşk `k` — the same rule as `isHeld()`. */
  private heldNazimSql(userId?: string) {
    return sql`ra.scope_id = k.id and ra.role = ${NAZIM}
      and ra.revoked_at is null
      and (ra.expires_at is null or ra.expires_at > now())
      ${userId ? sql`and ra.user_id = ${userId}` : sql``}`;
  }

  /**
   * The rows a caller may see at all: everything for the başnazım, the
   * köşks they manage for a nazım. A `managerId` that is no UUID manages
   * nothing, so it matches no row rather than failing in Postgres.
   */
  private scopeSql(managerId?: string) {
    if (managerId === undefined) return sql`true`;
    if (!UUID_REGEX.test(managerId)) return sql`false`;
    return sql`exists (select 1 from role_assignments ra where ${this.heldNazimSql(managerId)})`;
  }

  private where(filter: IKoskDirectoryFilter) {
    const parts = [this.scopeSql(filter.managerId)];
    if (filter.status !== "ALL") {
      parts.push(sql`(${this.statusSql()}) = ${filter.status}`);
    }
    if (filter.id) parts.push(sql`k.id = ${filter.id}`);
    if (filter.level) parts.push(sql`k.level = ${filter.level}`);
    if (filter.field) parts.push(sql`k.field = ${filter.field}`);
    if (filter.listing === "LISTED") parts.push(sql`not k.is_private`);
    if (filter.listing === "UNLISTED") parts.push(sql`k.is_private`);
    const q = filter.q?.trim();
    if (q) {
      const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
      parts.push(
        sql`(k.name ilike ${like} or k.handle ilike ${like} or exists (
          select 1 from role_assignments ra join users u on u.id = ra.user_id
           where ${this.heldNazimSql()}
             and concat_ws(' ', u.given_name, u.family_name) ilike ${like}))`
      );
    }
    return sql`where ${sql.join(parts, sql` and `)}`;
  }

  async findDirectory(
    filter: IKoskDirectoryFilter,
    limit: number,
    offset: number
  ): Promise<{ items: IKoskDirectoryRow[]; total: number }> {
    const where = this.where(filter);
    const result = await this.db.execute<{
      id: string;
      handle: string | null;
      name: string;
      cover_hue: number;
      field: string | null;
      level: string | null;
      is_private: boolean;
      status: KoskStatus;
      since: Date | string | null;
      hidden_level: HideLevel | null;
      nazim_ids: string[];
      course_count: string;
    }>(sql`
      select k.id, k.handle, k.name, k.cover_hue, k.field, k.level, k.is_private,
             ${this.statusSql()} as status,
             coalesce(k.archived_at, k.passive_since) as since,
             case when k.archived_at is not null
                  then coalesce(k.archived_level::text, 'kosk') end as hidden_level,
             coalesce((select json_agg(ra.user_id::text order by ra.created_at, ra.user_id)
                         from role_assignments ra where ${this.heldNazimSql()}),
                      '[]'::json) as nazim_ids,
             (select count(*) from courses c where c.kosk_id = k.id) as course_count
        from kosks k
        ${where}
       order by k.name, k.id
       limit ${limit} offset ${offset}`);
    const [count] = (
      await this.db.execute<{ total: string }>(
        sql`select count(*) as total from kosks k ${where}`
      )
    ).rows;
    return {
      items: result.rows.map((r) => ({
        id: r.id,
        handle: r.handle?.replace(/^@+/, "") || null,
        name: r.name,
        coverHue: r.cover_hue,
        field: r.field,
        level: r.level,
        isPrivate: r.is_private,
        status: r.status,
        // A raw `execute` skips drizzle's column mappers: timestamps arrive as text.
        since: r.since ? new Date(r.since) : null,
        hiddenLevel: r.hidden_level,
        nazimIds: r.nazim_ids,
        courseCount: Number(r.course_count),
      })),
      total: Number(count?.total ?? 0),
    };
  }

  /** Every köşk the caller may see by status, whatever the filters: the tabs' numbers. */
  async statusCounts(managerId?: string): Promise<IKoskDirectoryCounts> {
    const [row] = (
      await this.db.execute<{
        total: string;
        active: string;
        passive: string;
        hidden: string;
      }>(sql`
        select count(*) as total,
               count(*) filter (where k.archived_at is null and k.passive_since is null) as active,
               count(*) filter (where k.archived_at is null and k.passive_since is not null) as passive,
               count(*) filter (where k.archived_at is not null) as hidden
          from kosks k where ${this.scopeSql(managerId)}`)
    ).rows;
    return {
      all: Number(row?.total ?? 0),
      active: Number(row?.active ?? 0),
      passive: Number(row?.passive ?? 0),
      hidden: Number(row?.hidden ?? 0),
    };
  }

  /** The fields the caller's köşks carry, for the Alan chips. */
  async fieldsInUse(managerId?: string): Promise<string[]> {
    const result = await this.db.execute<{ field: string }>(sql`
      select distinct k.field from kosks k
       where k.field is not null and k.field <> '' and ${this.scopeSql(managerId)}
       order by k.field`);
    return result.rows.map((r) => r.field);
  }

  // ---- who manages a köşk ----------------------------------------------------

  /** The held KOSK_NAZIM rows, oldest first (nizam/25). */
  async heldNazims(koskId: string): Promise<IKoskNazimRow[]> {
    const rows = await this.db
      .select({
        userId: roleAssignments.userId,
        grantedBy: roleAssignments.grantedBy,
        grantedAt: roleAssignments.createdAt,
        endsAt: roleAssignments.expiresAt,
      })
      .from(roleAssignments)
      .where(holdsIn(NAZIM, koskId))
      .orderBy(roleAssignments.createdAt, roleAssignments.userId);
    return rows;
  }

  /** Of `ids`, who has ever been a nazım of this köşk (a held or a past row). */
  async everNazimsOf(koskId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.db
      .select({ userId: roleAssignments.userId })
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.role, NAZIM),
          eq(roleAssignments.scopeId, koskId),
          inArray(roleAssignments.userId, ids)
        )
      );
    return new Set(rows.map((r) => r.userId));
  }

  /** Of `ids`, who holds the Medaris nazımı role now. */
  async medarisNazimsAmong(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.db
      .select({ userId: roleAssignments.userId })
      .from(roleAssignments)
      .where(
        and(
          inArray(roleAssignments.userId, ids),
          sql`${roleAssignments.role} = ${ASSIGNED_ROLES.MEDARIS_NAZIM}`,
          sql`${roleAssignments.revokedAt} is null`,
          sql`(${roleAssignments.expiresAt} is null or ${roleAssignments.expiresAt} > now())`
        )
      );
    return new Set(rows.map((r) => r.userId));
  }

  async people(ids: string[]): Promise<Map<string, IPersonRow>> {
    const result = new Map<string, IPersonRow>();
    const wanted = [...new Set(ids)].filter((id) => UUID_REGEX.test(id));
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

  async koskName(koskId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ name: kosks.name })
      .from(kosks)
      .where(eq(kosks.id, koskId))
      .limit(1);
    return row?.name ?? null;
  }

  /**
   * Adds the nazımları under the köşk lock, so two additions racing each
   * other see one another's result. All or nothing: if any of the people is a
   * nazım already, nothing is written (nizam/21: "Aynı kişi ikinci kez
   * eklenemez"). A passive köşk is active again — a nazım now attends it.
   * One audit row per person.
   */
  async addNazims(
    koskId: string,
    actorId: string,
    userIds: string[],
    endsAt: Date | null
  ): Promise<AddNazimsOutcome> {
    return this.db.transaction(async (tx) => {
      const [kosk] = await tx
        .select({ id: kosks.id, name: kosks.name })
        .from(kosks)
        .where(eq(kosks.id, koskId))
        .for("no key update");
      if (!kosk) return { status: "no-kosk" } as const;
      const held = await tx
        .select({ userId: roleAssignments.userId })
        .from(roleAssignments)
        .where(holdsIn(NAZIM, koskId));
      const heldIds = new Set(held.map((h) => h.userId));
      const already = userIds.filter((id) => heldIds.has(id));
      if (already.length > 0) {
        return { status: "exists", userIds: already } as const;
      }
      for (const userId of userIds) {
        await grantRole(tx, {
          userId,
          role: NAZIM,
          scopeId: koskId,
          grantedBy: actorId,
          expiresAt: endsAt,
        });
        await tx.insert(auditLog).values({
          actorId,
          action: "kosk.nazim.add",
          entity: "kosk",
          entityId: koskId,
          details: {
            name: kosk.name,
            userId,
            endsAt: endsAt?.toISOString() ?? null,
          },
        });
      }
      await tx
        .update(kosks)
        .set({ passiveSince: null, passiveReason: null, updatedAt: new Date() })
        .where(eq(kosks.id, koskId));
      return { status: "added" } as const;
    });
  }

  // ---- opening, hiding, restoring -----------------------------------------------

  /**
   * Opens a köşk with its nazımları (nizam/10): the köşk, a KOSK_NAZIM grant
   * per person in the actor's name and the audit row land together or not at
   * all. The actor is the köşk's `ownerId` but not one of its nazımları.
   */
  async createWithNazims(
    kosk: ICreateKosk,
    nazimIds: string[]
  ): Promise<IKosk> {
    return this.db.transaction(async (tx: Tx) => {
      const [created] = await tx.insert(kosks).values(kosk).returning();
      for (const userId of nazimIds) {
        await grantRole(tx, {
          userId,
          role: NAZIM,
          scopeId: created.id,
          grantedBy: kosk.ownerId,
        });
      }
      await tx.insert(auditLog).values({
        actorId: kosk.ownerId,
        action: "kosk.create",
        entity: "kosk",
        entityId: created.id,
        details: {
          name: created.name,
          handle: created.handle,
          nazimIds,
        },
      });
      return created;
    });
  }

  /** Hides the köşk: it keeps its row and its courses, and leaves every list. */
  async hide(
    koskId: string,
    actorId: string,
    level: HideLevel
  ): Promise<HideOutcome> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ name: kosks.name, archivedAt: kosks.archivedAt })
        .from(kosks)
        .where(eq(kosks.id, koskId))
        .for("no key update");
      if (!row) return "no-kosk";
      if (row.archivedAt !== null) return "already-hidden";
      await tx
        .update(kosks)
        .set({
          archivedAt: new Date(),
          archivedBy: actorId,
          archivedLevel: level,
          updatedAt: new Date(),
        })
        .where(eq(kosks.id, koskId));
      await recordHide(tx, {
        actorId,
        verb: "hide",
        entity: "kosk",
        entityId: koskId,
        title: row.name,
        level,
        koskId,
        extra: { name: row.name },
      });
      return "hidden";
    });
  }

  /** Brings a hidden köşk back (nizam/09 "Geri al"). */
  async restore(
    koskId: string,
    actorId: string,
    level: HideLevel
  ): Promise<RestoreOutcome> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          name: kosks.name,
          archivedAt: kosks.archivedAt,
          archivedLevel: kosks.archivedLevel,
        })
        .from(kosks)
        .where(eq(kosks.id, koskId))
        .for("no key update");
      if (!row) return "no-kosk";
      if (row.archivedAt === null) return "not-hidden";
      // By the level that hid it or one above (MDRS-135, the ban rule); a köşk
      // hidden before the level was recorded counts as hidden by the köşk.
      const hiddenAt = hiderLevelOf({
        type: "kosk",
        madrasahId: null,
        archivedLevel: row.archivedLevel,
      });
      if (!mayRestoreAt(level, hiddenAt)) {
        throw new ArchiveRestoreLevelError(hiddenAt, level);
      }
      await tx
        .update(kosks)
        .set({
          archivedAt: null,
          archivedBy: null,
          archivedLevel: null,
          updatedAt: new Date(),
        })
        .where(eq(kosks.id, koskId));
      await recordHide(tx, {
        actorId,
        verb: "restore",
        entity: "kosk",
        entityId: koskId,
        title: row.name,
        level,
        hiddenLevel: hiddenAt,
        koskId,
        extra: {
          name: row.name,
          hiddenSince: row.archivedAt.toISOString(),
        },
      });
      return "restored";
    });
  }

  // ---- nizam/20 and 23: the köşk page and its courses ----------------------------

  /** The numbers and facts of nizam/20, or null when there is no such köşk. */
  async overview(koskId: string): Promise<IKoskOverviewRow | null> {
    const [head] = (
      await this.db.execute<{
        status: KoskStatus;
        since: Date | string | null;
        hidden_level: HideLevel | null;
        created_at: Date | string;
        owner_id: string;
      }>(sql`
        select ${this.statusSql()} as status,
               coalesce(k.archived_at, k.passive_since) as since,
               case when k.archived_at is not null
                    then coalesce(k.archived_level::text, 'kosk') end as hidden_level,
               k.created_at, k.owner_id
          from kosks k where k.id = ${koskId}`)
    ).rows;
    if (!head) return null;
    const [numbers] = (
      await this.db.execute<{
        total: string;
        published: string;
        draft: string;
        hidden: string;
        students: string;
        pending: string;
        nazims: string;
      }>(sql`
        select
          (select count(*) from courses c where c.kosk_id = ${koskId}) as total,
          (select count(*) from courses c where c.kosk_id = ${koskId}
              and c.archived_at is null and c.status = 'PUBLISHED') as published,
          (select count(*) from courses c where c.kosk_id = ${koskId}
              and c.archived_at is null and c.status = 'DRAFT') as draft,
          (select count(*) from courses c where c.kosk_id = ${koskId}
              and c.archived_at is not null) as hidden,
          (select count(distinct e.user_id) from enrollments e
             join courses c on c.id = e.course_id
            where c.kosk_id = ${koskId} and c.archived_at is null
              and e.status = 'ENROLLED') as students,
          (select count(*) from enrollments e
             join courses c on c.id = e.course_id
            where c.kosk_id = ${koskId} and c.archived_at is null
              and e.status = 'PENDING') as pending,
          (select count(*) from role_assignments ra, kosks k
            where k.id = ${koskId} and ${this.heldNazimSql()}) as nazims`)
    ).rows;
    const hosting = await this.db.execute<{ id: string; name: string }>(sql`
      select m.id, m.name
        from madrasah_kosk_hosting h
        join madrasahs m on m.id = h.madrasah_id
       where h.kosk_id = ${koskId} and h.revoked_at is null
         and m.archived_at is null
       order by h.created_at, m.name`);
    return {
      status: head.status,
      since: head.since ? new Date(head.since) : null,
      hiddenLevel: head.hidden_level,
      openedAt: new Date(head.created_at),
      ownerId: head.owner_id,
      courses: {
        all: Number(numbers?.total ?? 0),
        published: Number(numbers?.published ?? 0),
        draft: Number(numbers?.draft ?? 0),
        hidden: Number(numbers?.hidden ?? 0),
      },
      students: Number(numbers?.students ?? 0),
      pendingApplications: Number(numbers?.pending ?? 0),
      nazimCount: Number(numbers?.nazims ?? 0),
      hostingMadrasahs: hosting.rows,
    };
  }

  /**
   * Every course of the köşk, hidden ones too, with what the Dersler table
   * (nizam/23) draws. A few reads over the course ids so that a course with
   * many müderrisler does not multiply rows.
   */
  async courseRoster(koskId: string): Promise<IKoskCourseRow[]> {
    const rows = await this.db.execute<{
      id: string;
      title: string;
      cover_hue: number;
      status: "PUBLISHED" | "DRAFT";
      archived_at: Date | string | null;
      created_at: Date | string;
      madrasah_id: string | null;
      madrasah_name: string | null;
      week_count: string;
      students: string;
      pending: string;
      banned: string;
    }>(sql`
      select c.id, c.title, c.cover_hue, c.status, c.archived_at, c.created_at,
             m.id as madrasah_id, m.name as madrasah_name,
             (select count(*) from course_weeks w
               where w.course_id = c.id and w.archived_at is null) as week_count,
             (select count(*) from enrollments e
               where e.course_id = c.id and e.status = 'ENROLLED') as students,
             (select count(*) from enrollments e
               where e.course_id = c.id and e.status = 'PENDING') as pending,
             (select count(distinct b.user_id) from bans b
               where b.kosk_id = c.kosk_id and b.lifted_at is null
                 and (b.course_id = c.id or b.scope = 'KOSK')) as banned
        from courses c
        left join madrasahs m on m.id = c.madrasah_id
       where c.kosk_id = ${koskId}
       order by c.created_at desc, c.id`);
    if (rows.rows.length === 0) return [];
    const ids = rows.rows.map((r) => r.id);
    const muderris = await this.db.execute<{
      course_id: string;
      name: string;
      is_imam: boolean;
    }>(sql`
      select cm.course_id, cm.name,
             exists (select 1 from role_assignments ra
                      where ra.role = ${ASSIGNED_ROLES.MUDERRIS}
                        and ra.is_imam and ra.revoked_at is null
                        and ra.scope_id = cm.course_id
                        and ra.user_id = cm.user_id) as is_imam
        from course_muderris cm
       where cm.course_id in (${sql.join(
         ids.map((id) => sql`${id}`),
         sql`, `
       )})
       order by cm.order_index, cm.id`);
    return rows.rows.map((r) => ({
      id: r.id,
      title: r.title,
      coverHue: r.cover_hue,
      weekCount: Number(r.week_count),
      madrasah: r.madrasah_id
        ? { id: r.madrasah_id, name: r.madrasah_name ?? "" }
        : null,
      status: r.archived_at ? "HIDDEN" : r.status,
      hiddenAt: r.archived_at ? new Date(r.archived_at) : null,
      createdAt: new Date(r.created_at),
      muderris: muderris.rows
        .filter((m) => m.course_id === r.id)
        .map((m) => ({ name: m.name, isImam: m.is_imam })),
      studentCount: Number(r.students),
      pendingCount: Number(r.pending),
      bannedCount: Number(r.banned),
    }));
  }

  /**
   * "Köşkü pasife al": the köşk is passive and its held nazımları are taken
   * off the post, in one transaction with the audit row naming them.
   */
  async deactivate(
    koskId: string,
    actorId: string
  ): Promise<"deactivated" | "no-kosk" | "already-passive"> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ name: kosks.name, passiveSince: kosks.passiveSince })
        .from(kosks)
        .where(eq(kosks.id, koskId))
        .for("no key update");
      if (!row) return "no-kosk";
      if (row.passiveSince !== null) return "already-passive";
      const held = await tx
        .select({ userId: roleAssignments.userId })
        .from(roleAssignments)
        .where(holdsIn(NAZIM, koskId));
      for (const { userId } of held) {
        await revokeRole(tx, {
          userId,
          role: NAZIM,
          scopeId: koskId,
          revokedBy: actorId,
        });
      }
      await tx
        .update(kosks)
        .set({
          passiveSince: new Date(),
          passiveReason: "DEACTIVATED_BY_ADMIN",
          updatedAt: new Date(),
        })
        .where(eq(kosks.id, koskId));
      await tx.insert(auditLog).values({
        actorId,
        action: "kosk.deactivate",
        entity: "kosk",
        entityId: koskId,
        details: { name: row.name, removedNazimIds: held.map((h) => h.userId) },
      });
      return "deactivated";
    });
  }

  /** One köşk as the table draws it, or null when there is none. */
  async findDirectoryItem(koskId: string): Promise<IKoskDirectoryRow | null> {
    const { items } = await this.findDirectory(
      { status: "ALL", listing: "ALL", id: koskId },
      1,
      0
    );
    return items[0] ?? null;
  }
}
