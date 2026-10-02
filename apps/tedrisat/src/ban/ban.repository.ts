import { Injectable } from "@nestjs/common";
import {
  and,
  desc,
  eq,
  isNotNull,
  isNull,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { DatabaseService } from "../database/database.service";
import { isHeld } from "../database/role-assignments";
import { auditLog } from "../database/schema/audit.schema";
import { BAN_SCOPES, type BanScope, bans } from "../database/schema/ban.schema";
import { courses, enrollments } from "../database/schema/course.schema";
import { kosks } from "../database/schema/kosk.schema";
import { madrasahs } from "../database/schema/madrasah.schema";
import { roleAssignments } from "../database/schema/role-assignment.schema";
import { users } from "../database/schema/user.schema";
import type { BanRole } from "./ban-tier";
import type { BanStatus } from "./dto/ban.dto";

export interface IBan {
  id: string;
  userId: string;
  koskId: string;
  courseId: string | null;
  scope: BanScope;
  extendedFromCourseId: string | null;
  reason: string;
  bannedBy: string;
  bannedRole: string;
  bannedTier: number;
  createdAt: Date;
  liftedAt: Date | null;
  liftedBy: string | null;
  liftReason: string | null;
}

export interface IBanPerson {
  id: string;
  name: string | null;
  email: string | null;
}

/** A ban with the names and titles its row stands for, as the lists print it. */
export interface IBanEntry extends IBan {
  user: IBanPerson;
  bannerPerson: IBanPerson;
  lifterPerson: IBanPerson | null;
  courseTitle: string | null;
  madrasahName: string | null;
  extendedFromCourseTitle: string | null;
  koskName: string | null;
}

export interface INewBan {
  userId: string;
  koskId: string;
  courseId: string | null;
  scope: BanScope;
  extendedFromCourseId: string | null;
  reason: string;
  bannedBy: string;
  bannedRole: BanRole;
  bannedTier: number;
  /** the course ban this one widens (MDRS-178); the audit row says `ban.extend` */
  extendedFromBanId?: string;
}

/** Which bans the Medaris-wide list shows (MDRS-178, screen nizam/48). */
export interface IBanFilter {
  status: BanStatus;
  scope?: BanScope;
  /** matched against the person's name and e-mail */
  q?: string;
  limit: number;
  offset: number;
}

export interface ICourseRef {
  id: string;
  koskId: string;
  madrasahId: string | null;
  title: string;
}

/** Where a person's roles are looked for. */
export interface IRoleScopes {
  koskId: string;
  courseId: string | null;
  madrasahId: string | null;
}

const fullName = (given: string | null, family: string | null) =>
  [given, family].filter(Boolean).join(" ").trim() || null;

const open = (): SQL => isNull(bans.liftedAt);

@Injectable()
export class BanRepository {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /** The course a ban is placed in; null when there is none. */
  async findCourse(courseId: string): Promise<ICourseRef | null> {
    const [row] = await this.db
      .select({
        id: courses.id,
        koskId: courses.koskId,
        madrasahId: courses.madrasahId,
        title: courses.title,
      })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);
    return row ?? null;
  }

  async findById(id: string): Promise<IBan | null> {
    const [row] = await this.db
      .select()
      .from(bans)
      .where(eq(bans.id, id))
      .limit(1);
    return (row as IBan | undefined) ?? null;
  }

  /**
   * The open ban that bars the person from the course, if any: a COURSE ban
   * on it, or a KOSK ban on the köşk it is in.
   */
  async findOpenBarring(
    userId: string,
    courseId: string,
    koskId: string
  ): Promise<IBan | null> {
    const [row] = await this.db
      .select()
      .from(bans)
      .where(
        and(
          eq(bans.userId, userId),
          open(),
          or(
            and(eq(bans.scope, BAN_SCOPES.COURSE), eq(bans.courseId, courseId)),
            and(eq(bans.scope, BAN_SCOPES.KOSK), eq(bans.koskId, koskId))
          )
        )
      )
      .orderBy(desc(bans.createdAt))
      .limit(1);
    return (row as IBan | undefined) ?? null;
  }

  /** Whether the person has an open ban that bars them from the course. */
  async isBarredFromCourse(userId: string, courseId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: bans.id })
      .from(bans)
      .where(
        and(
          eq(bans.userId, userId),
          open(),
          or(
            and(eq(bans.scope, BAN_SCOPES.COURSE), eq(bans.courseId, courseId)),
            and(
              eq(bans.scope, BAN_SCOPES.KOSK),
              eq(
                bans.koskId,
                sql`(select ${courses.koskId} from ${courses} where ${courses.id} = ${courseId})`
              )
            )
          )
        )
      )
      .limit(1);
    return rows.length > 0;
  }

  /**
   * The open bans of the given people in a course, keyed by person: what the
   * roster marks "Yasaklı". A KOSK ban counts for every course of its köşk.
   */
  async openBansInCourse(
    courseId: string,
    koskId: string
  ): Promise<Map<string, IBan>> {
    const rows = await this.db
      .select()
      .from(bans)
      .where(
        and(
          open(),
          or(
            and(eq(bans.scope, BAN_SCOPES.COURSE), eq(bans.courseId, courseId)),
            and(eq(bans.scope, BAN_SCOPES.KOSK), eq(bans.koskId, koskId))
          )
        )
      )
      .orderBy(bans.createdAt);
    const byUser = new Map<string, IBan>();
    // A KOSK ban reaches further, so it is the one shown when both are open.
    for (const row of rows as IBan[]) {
      const current = byUser.get(row.userId);
      if (!current || row.scope === BAN_SCOPES.KOSK)
        byUser.set(row.userId, row);
    }
    return byUser;
  }

  /** The roles the person holds that bear on the scopes, one entry per role held. */
  async rolesHeld(userId: string, scopes: IRoleScopes): Promise<BanRole[]> {
    const at = (type: string, id: string | null): SQL | undefined =>
      id === null
        ? undefined
        : and(
            eq(roleAssignments.scopeType, type as "kosk"),
            eq(roleAssignments.scopeId, id)
          );
    const where = [
      eq(roleAssignments.scopeType, "platform"),
      at("kosk", scopes.koskId),
      at("course", scopes.courseId),
      at("madrasah", scopes.madrasahId),
    ].filter((x): x is SQL => x !== undefined);
    const rows = await this.db
      .select({ role: roleAssignments.role })
      .from(roleAssignments)
      .where(and(eq(roleAssignments.userId, userId), isHeld(), or(...where)));
    return rows.map((r) => r.role as BanRole);
  }

  /**
   * Opens a ban and writes its audit row in one transaction. The person
   * already barred in that scope is not barred twice: the open ban that
   * stands is returned with `created: false`.
   */
  async create(entry: INewBan): Promise<{ ban: IBan; created: boolean }> {
    return this.db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(bans)
        .values(entry)
        .onConflictDoNothing()
        .returning();
      if (inserted) {
        await tx.insert(auditLog).values({
          actorId: entry.bannedBy,
          action: entry.extendedFromBanId ? "ban.extend" : "ban.create",
          entity: "ban",
          entityId: inserted.id,
          details: {
            extendedFromBanId: entry.extendedFromBanId ?? null,
            userId: entry.userId,
            scope: entry.scope,
            koskId: entry.koskId,
            courseId: entry.courseId,
            extendedFromCourseId: entry.extendedFromCourseId,
            role: entry.bannedRole,
            reason: entry.reason,
          },
        });
        return { ban: inserted as IBan, created: true };
      }
      const [standing] = await tx
        .select()
        .from(bans)
        .where(
          and(
            eq(bans.userId, entry.userId),
            open(),
            entry.scope === BAN_SCOPES.COURSE
              ? and(
                  eq(bans.scope, BAN_SCOPES.COURSE),
                  eq(bans.courseId, entry.courseId as string)
                )
              : and(
                  eq(bans.scope, BAN_SCOPES.KOSK),
                  eq(bans.koskId, entry.koskId)
                )
          )
        )
        .limit(1);
      return { ban: standing as IBan, created: false };
    });
  }

  /**
   * Lifts an open ban with its reason and writes the audit row, in one
   * transaction. Null when it was lifted in the meantime.
   */
  async lift(
    id: string,
    entry: { liftedBy: string; liftReason: string; role: string }
  ): Promise<IBan | null> {
    return this.db.transaction(async (tx) => {
      const [lifted] = await tx
        .update(bans)
        .set({
          liftedAt: sql`now()`,
          liftedBy: entry.liftedBy,
          liftReason: entry.liftReason,
        })
        .where(and(eq(bans.id, id), open()))
        .returning();
      if (!lifted) return null;
      await tx.insert(auditLog).values({
        actorId: entry.liftedBy,
        action: "ban.lift",
        entity: "ban",
        entityId: id,
        details: {
          userId: lifted.userId,
          scope: lifted.scope,
          koskId: lifted.koskId,
          courseId: lifted.courseId,
          role: entry.role,
          reason: entry.liftReason,
        },
      });
      return lifted as IBan;
    });
  }

  /** A köşk's bans, open or lifted, newest first, with their names. */
  async listByKosk(koskId: string, status: BanStatus): Promise<IBanEntry[]> {
    return this.entries(
      and(
        eq(bans.koskId, koskId),
        status === "ACTIVE" ? isNull(bans.liftedAt) : isNotNull(bans.liftedAt)
      ) as SQL,
      status === "ACTIVE" ? desc(bans.createdAt) : desc(bans.liftedAt)
    );
  }

  /** One ban with its names, open or lifted. */
  async findEntry(id: string): Promise<IBanEntry | null> {
    const [entry] = await this.entries(eq(bans.id, id), desc(bans.createdAt));
    return entry ?? null;
  }

  /**
   * Every köşk's bans for Medaris administration (MDRS-178), one page of them
   * and how many match in all.
   */
  async listAll(
    filter: IBanFilter
  ): Promise<{ items: IBanEntry[]; total: number }> {
    const conditions: SQL[] = [
      filter.status === "ACTIVE"
        ? isNull(bans.liftedAt)
        : isNotNull(bans.liftedAt),
    ];
    if (filter.scope) conditions.push(eq(bans.scope, filter.scope));
    const needle = filter.q?.trim();
    if (needle) {
      const like = `%${needle.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      conditions.push(
        sql`exists (
          select 1 from ${users} u
          where u.id = ${bans.userId}
            and (concat_ws(' ', u.given_name, u.family_name) ilike ${like}
              or u.email ilike ${like})
        )`
      );
    }
    const where = and(...conditions) as SQL;
    const [items, [count]] = await Promise.all([
      this.entries(
        where,
        filter.status === "ACTIVE" ? desc(bans.createdAt) : desc(bans.liftedAt),
        { limit: filter.limit, offset: filter.offset }
      ),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(bans)
        .where(where),
    ]);
    return { items, total: count?.total ?? 0 };
  }

  /** Whether the person holds a platform-wide role (Medaris nazımı). */
  async holdsPlatformRole(userId: string, role: BanRole): Promise<boolean> {
    const rows = await this.db
      .select({ id: roleAssignments.id })
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.userId, userId),
          eq(roleAssignments.scopeType, "platform"),
          eq(roleAssignments.role, role as "MEDARIS_NAZIM"),
          isHeld()
        )
      )
      .limit(1);
    return rows.length > 0;
  }

  private async entries(
    where: SQL,
    order: SQL,
    page?: { limit: number; offset: number }
  ): Promise<IBanEntry[]> {
    const target = alias(users, "ban_target");
    const banner = alias(users, "ban_banner");
    const lifter = alias(users, "ban_lifter");
    const course = alias(courses, "ban_course");
    const widened = alias(courses, "ban_widened");
    const seat = alias(enrollments, "ban_seat");
    const query = this.db
      .select({
        ban: bans,
        targetGiven: target.givenName,
        targetFamily: target.familyName,
        targetEmail: target.email,
        seatName: seat.studentName,
        seatEmail: seat.studentEmail,
        bannerGiven: banner.givenName,
        bannerFamily: banner.familyName,
        bannerEmail: banner.email,
        lifterGiven: lifter.givenName,
        lifterFamily: lifter.familyName,
        lifterEmail: lifter.email,
        courseTitle: course.title,
        madrasahName: madrasahs.name,
        widenedTitle: widened.title,
        koskName: kosks.name,
      })
      .from(bans)
      .leftJoin(target, eq(target.id, bans.userId))
      .leftJoin(banner, eq(banner.id, bans.bannedBy))
      .leftJoin(lifter, eq(lifter.id, bans.liftedBy))
      .leftJoin(course, eq(course.id, bans.courseId))
      .leftJoin(widened, eq(widened.id, bans.extendedFromCourseId))
      .leftJoin(madrasahs, eq(madrasahs.id, course.madrasahId))
      .leftJoin(kosks, eq(kosks.id, bans.koskId))
      .leftJoin(
        seat,
        and(
          eq(seat.userId, bans.userId),
          eq(
            seat.courseId,
            sql`coalesce(${bans.courseId}, ${bans.extendedFromCourseId})`
          )
        )
      )
      .where(where)
      .orderBy(order, desc(bans.id))
      .$dynamic();
    const rows = await (page
      ? query.limit(page.limit).offset(page.offset)
      : query);

    return rows.map((r) => ({
      ...(r.ban as IBan),
      user: {
        id: r.ban.userId,
        name: fullName(r.targetGiven, r.targetFamily) ?? r.seatName ?? null,
        email: r.targetEmail ?? r.seatEmail ?? null,
      },
      bannerPerson: {
        id: r.ban.bannedBy,
        name: fullName(r.bannerGiven, r.bannerFamily),
        email: r.bannerEmail,
      },
      lifterPerson: r.ban.liftedBy
        ? {
            id: r.ban.liftedBy,
            name: fullName(r.lifterGiven, r.lifterFamily),
            email: r.lifterEmail,
          }
        : null,
      courseTitle: r.courseTitle,
      madrasahName: r.madrasahName,
      extendedFromCourseTitle: r.widenedTitle,
      koskName: r.koskName,
    }));
  }

  /**
   * Open and lifted counts, and open bans placed since `since`, for one köşk,
   * or for every köşk when `koskId` is null (MDRS-178).
   */
  async counts(
    koskId: string | null,
    since: Date
  ): Promise<{ active: number; lifted: number; recent: number }> {
    const [row] = await this.db
      .select({
        active: sql<number>`count(*) filter (where ${bans.liftedAt} is null)::int`,
        lifted: sql<number>`count(*) filter (where ${bans.liftedAt} is not null)::int`,
        recent: sql<number>`count(*) filter (where ${bans.liftedAt} is null and ${bans.createdAt} > ${since})::int`,
      })
      .from(bans)
      .where(koskId === null ? undefined : eq(bans.koskId, koskId));
    return {
      active: row?.active ?? 0,
      lifted: row?.lifted ?? 0,
      recent: row?.recent ?? 0,
    };
  }

  /** The names of the people behind some ids; ids it does not know are absent. */
  async person(id: string): Promise<IBanPerson | null> {
    const [row] = await this.db
      .select({
        givenName: users.givenName,
        familyName: users.familyName,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!row) return null;
    return {
      id,
      name: fullName(row.givenName, row.familyName),
      email: row.email,
    };
  }
}
