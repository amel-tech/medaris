import { Injectable } from "@nestjs/common";
import {
  and,
  desc,
  eq,
  inArray,
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
import {
  BAN_SCOPES,
  type BanScope,
  banPermanentRequests,
  bans,
} from "../database/schema/ban.schema";
import { courses, enrollments } from "../database/schema/course.schema";
import { madrasahs } from "../database/schema/madrasah.schema";
import { roleAssignments } from "../database/schema/role-assignment.schema";
import { users } from "../database/schema/user.schema";
import type { BanRole, IBanScopes, IHeldAssignment } from "./ban-tier";
import type { BanStatus } from "./dto/ban.dto";

export interface IBan {
  id: string;
  userId: string;
  /** Null for a MADRASAH ban, which belongs to no single köşk. */
  koskId: string | null;
  /** Set for a MADRASAH ban alone. */
  madrasahId: string | null;
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
  /** When the medrese asked for the ban to be permanent; null when it has not. */
  permanentRequestedAt: Date | null;
}

export interface INewBan {
  userId: string;
  koskId: string | null;
  madrasahId: string | null;
  courseId: string | null;
  scope: BanScope;
  extendedFromCourseId: string | null;
  reason: string;
  bannedBy: string;
  bannedRole: BanRole;
  bannedTier: number;
}

export interface ICourseRef {
  id: string;
  koskId: string;
  madrasahId: string | null;
  title: string;
}

const fullName = (given: string | null, family: string | null) =>
  [given, family].filter(Boolean).join(" ").trim() || null;

const open = (): SQL => isNull(bans.liftedAt);

/** The medrese a course belongs to, as a subquery; null for a köşk's own course. */
const courseMadrasah = (courseId: string): SQL =>
  sql`(select ${courses.madrasahId} from ${courses} where ${courses.id} = ${courseId})`;

/** The open ban that a new one would repeat: the same person barred in the same scope. */
const sameBar = (entry: INewBan): SQL =>
  (entry.scope === BAN_SCOPES.COURSE
    ? and(
        eq(bans.scope, BAN_SCOPES.COURSE),
        eq(bans.courseId, entry.courseId as string)
      )
    : entry.scope === BAN_SCOPES.KOSK
      ? and(
          eq(bans.scope, BAN_SCOPES.KOSK),
          eq(bans.koskId, entry.koskId as string)
        )
      : and(
          eq(bans.scope, BAN_SCOPES.MADRASAH),
          eq(bans.madrasahId, entry.madrasahId as string)
        )) as SQL;

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
   * on it, a KOSK ban on the köşk it is in, or a MADRASAH ban on the medrese
   * it belongs to.
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
            and(eq(bans.scope, BAN_SCOPES.KOSK), eq(bans.koskId, koskId)),
            eq(bans.madrasahId, courseMadrasah(courseId))
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
            ),
            eq(bans.madrasahId, courseMadrasah(courseId))
          )
        )
      )
      .limit(1);
    return rows.length > 0;
  }

  /**
   * The open bans of the given people in a course, keyed by person: what the
   * roster marks "Yasaklı". A KOSK ban counts for every course of its köşk, a
   * MADRASAH ban for every course of its medrese.
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
            and(eq(bans.scope, BAN_SCOPES.KOSK), eq(bans.koskId, koskId)),
            eq(bans.madrasahId, courseMadrasah(courseId))
          )
        )
      )
      .orderBy(bans.createdAt);
    const byUser = new Map<string, IBan>();
    // The wider ban is the one shown when several are open: a COURSE ban
    // gives way to either of the others, a KOSK ban to nothing.
    for (const row of rows as IBan[]) {
      const current = byUser.get(row.userId);
      if (
        !current ||
        row.scope === BAN_SCOPES.KOSK ||
        (row.scope === BAN_SCOPES.MADRASAH && current.scope !== BAN_SCOPES.KOSK)
      )
        byUser.set(row.userId, row);
    }
    return byUser;
  }

  /** The roles the person holds that bear on the scopes, one entry per role held. */
  async rolesHeld(userId: string, scopes: IBanScopes): Promise<BanRole[]> {
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
          action: "ban.create",
          entity: "ban",
          entityId: inserted.id,
          details: {
            userId: entry.userId,
            scope: entry.scope,
            koskId: entry.koskId,
            madrasahId: entry.madrasahId,
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
        .where(and(eq(bans.userId, entry.userId), open(), sameBar(entry)))
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
          madrasahId: lifted.madrasahId,
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

  private async entries(where: SQL, order: SQL): Promise<IBanEntry[]> {
    const target = alias(users, "ban_target");
    const banner = alias(users, "ban_banner");
    const lifter = alias(users, "ban_lifter");
    const course = alias(courses, "ban_course");
    const widened = alias(courses, "ban_widened");
    const seat = alias(enrollments, "ban_seat");
    const rows = await this.db
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
        anySeatName: sql<
          string | null
        >`(select ${enrollments.studentName} from ${enrollments} where ${enrollments.userId} = ${bans.userId} and ${enrollments.studentName} is not null order by ${enrollments.createdAt} limit 1)`,
        anySeatEmail: sql<
          string | null
        >`(select ${enrollments.studentEmail} from ${enrollments} where ${enrollments.userId} = ${bans.userId} and ${enrollments.studentEmail} is not null order by ${enrollments.createdAt} limit 1)`,
        permanentRequestedAt: banPermanentRequests.createdAt,
      })
      .from(bans)
      .leftJoin(target, eq(target.id, bans.userId))
      .leftJoin(banner, eq(banner.id, bans.bannedBy))
      .leftJoin(lifter, eq(lifter.id, bans.liftedBy))
      .leftJoin(course, eq(course.id, bans.courseId))
      .leftJoin(widened, eq(widened.id, bans.extendedFromCourseId))
      .leftJoin(
        madrasahs,
        eq(
          madrasahs.id,
          sql`coalesce(${course.madrasahId}, ${bans.madrasahId})`
        )
      )
      .leftJoin(banPermanentRequests, eq(banPermanentRequests.banId, bans.id))
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
      .orderBy(order, desc(bans.id));

    return rows.map((r) => ({
      ...(r.ban as IBan),
      user: {
        id: r.ban.userId,
        // The users row first, then the seat the ban was placed from, then any
        // seat the person holds: a medrese-wide ban names no course.
        name:
          fullName(r.targetGiven, r.targetFamily) ??
          r.seatName ??
          r.anySeatName ??
          null,
        email: r.targetEmail ?? r.seatEmail ?? r.anySeatEmail ?? null,
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
      permanentRequestedAt: r.permanentRequestedAt,
    }));
  }

  /** Open and lifted counts, and open bans placed since `since`, for one köşk. */
  async counts(
    koskId: string,
    since: Date
  ): Promise<{ active: number; lifted: number; recent: number }> {
    const [row] = await this.db
      .select({
        active: sql<number>`count(*) filter (where ${bans.liftedAt} is null)::int`,
        lifted: sql<number>`count(*) filter (where ${bans.liftedAt} is not null)::int`,
        recent: sql<number>`count(*) filter (where ${bans.liftedAt} is null and ${bans.createdAt} > ${since})::int`,
      })
      .from(bans)
      .where(eq(bans.koskId, koskId));
    return {
      active: row?.active ?? 0,
      lifted: row?.lifted ?? 0,
      recent: row?.recent ?? 0,
    };
  }

  /**
   * What a medrese's ban list holds: the MADRASAH bans of the medrese and the
   * COURSE bans on its courses, hidden ones included. A KOSK ban is the köşk's
   * (nizam/40) and is not here.
   */
  private inMadrasah(madrasahId: string): SQL {
    return or(
      eq(bans.madrasahId, madrasahId),
      inArray(
        bans.courseId,
        this.db
          .select({ id: courses.id })
          .from(courses)
          .where(eq(courses.madrasahId, madrasahId))
      )
    ) as SQL;
  }

  /**
   * A medrese's bans, open or lifted, newest first, with their names. `scope`
   * narrows to the medrese-wide bans or to the course bans; `courseId` to one
   * course's.
   */
  async listByMadrasah(
    madrasahId: string,
    status: BanStatus,
    filter: { scope?: BanScope; courseId?: string } = {}
  ): Promise<IBanEntry[]> {
    const narrowed: (SQL | undefined)[] = [
      filter.scope === BAN_SCOPES.MADRASAH
        ? isNotNull(bans.madrasahId)
        : undefined,
      filter.scope === BAN_SCOPES.COURSE ? isNotNull(bans.courseId) : undefined,
      filter.courseId ? eq(bans.courseId, filter.courseId) : undefined,
    ];
    return this.entries(
      and(
        this.inMadrasah(madrasahId),
        status === "ACTIVE" ? isNull(bans.liftedAt) : isNotNull(bans.liftedAt),
        ...narrowed
      ) as SQL,
      status === "ACTIVE" ? desc(bans.createdAt) : desc(bans.liftedAt)
    );
  }

  /** Open and lifted counts, and open bans placed since `since`, for one medrese. */
  async countsByMadrasah(
    madrasahId: string,
    since: Date
  ): Promise<{ active: number; lifted: number; recent: number }> {
    const [row] = await this.db
      .select({
        active: sql<number>`count(*) filter (where ${bans.liftedAt} is null)::int`,
        lifted: sql<number>`count(*) filter (where ${bans.liftedAt} is not null)::int`,
        recent: sql<number>`count(*) filter (where ${bans.liftedAt} is null and ${bans.createdAt} > ${since})::int`,
      })
      .from(bans)
      .where(this.inMadrasah(madrasahId));
    return {
      active: row?.active ?? 0,
      lifted: row?.lifted ?? 0,
      recent: row?.recent ?? 0,
    };
  }

  /** The people an open MADRASAH ban already bars from the medrese. */
  async openMadrasahBanUsers(madrasahId: string): Promise<Set<string>> {
    const rows = await this.db
      .select({ userId: bans.userId })
      .from(bans)
      .where(and(eq(bans.madrasahId, madrasahId), open()));
    return new Set(rows.map((r) => r.userId));
  }

  /** Every role the person holds, with its scope, for those that need the answer per row. */
  async rolesOf(userId: string): Promise<IHeldAssignment[]> {
    return this.db
      .select({
        role: roleAssignments.role,
        scopeType: roleAssignments.scopeType,
        scopeId: roleAssignments.scopeId,
      })
      .from(roleAssignments)
      .where(and(eq(roleAssignments.userId, userId), isHeld()));
  }

  /**
   * Records that the medrese asks for the ban to be permanent, with the audit
   * row, in one transaction. False when the ban has a request already.
   */
  async requestPermanent(entry: {
    banId: string;
    reason: string;
    requestedBy: string;
    role: string;
  }): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(banPermanentRequests)
        .values({
          banId: entry.banId,
          reason: entry.reason,
          requestedBy: entry.requestedBy,
        })
        .onConflictDoNothing()
        .returning({ id: banPermanentRequests.id });
      if (!created) return false;
      await tx.insert(auditLog).values({
        actorId: entry.requestedBy,
        action: "ban.permanent_request",
        entity: "ban",
        entityId: entry.banId,
        details: { role: entry.role, reason: entry.reason },
      });
      return true;
    });
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
