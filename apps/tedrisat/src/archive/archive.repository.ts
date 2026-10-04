import { Injectable } from "@nestjs/common";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  courseIdsOfKosk,
  purgeCourses,
  recordDeletion,
  Tx,
} from "../course/course-purge";
import { DatabaseService } from "../database/database.service";
import { deleteAssignmentsIn } from "../database/role-assignments";
import {
  courses,
  courseWeeks,
  lessons,
} from "../database/schema/course.schema";
import {
  flashcardProgress,
  flashcards,
} from "../database/schema/flashcard.schema";
import { decks } from "../database/schema/flashcard-deck.schema";
import { koskFollowers, kosks } from "../database/schema/kosk.schema";
import { lessonInvitations } from "../database/schema/lesson-invitation.schema";
import { madrasahs } from "../database/schema/madrasah.schema";
import {
  roleAssignments,
  SCOPE_TYPES,
} from "../database/schema/role-assignment.schema";
import { users } from "../database/schema/user.schema";
import {
  ARCHIVER_ROLE_ORDER,
  ArchiveItemType,
  IArchiveFilter,
  IArchiveImpact,
  IArchiveItem,
  IArchiveScopes,
  STORED_ARCHIVE_ITEM_TYPES,
} from "./archive-types";

/** Who hid something, as the screens print it. */
export interface IArchiver {
  id: string;
  name: string | null;
  role: string | null;
}

export type RestoreOutcome =
  | { status: "restored"; title: string }
  | { status: "parent-hidden" }
  | { status: "not-found" };

/**
 * Everything hidden in one query: each table that can hide something
 * contributes its hidden rows under one shape (MDRS-173).
 *
 * A week is listed only while its course is shown, and a session only while
 * its week and its course are: hiding a course hides what is under it, and
 * listing the parts of a hidden whole would show the same loss twice. Restoring
 * the whole brings them back with it.
 */
const HIDDEN = sql`
  select 'kosk'::text as type, k.id, k.name as title, k.id as kosk_id,
         null::uuid as madrasah_id, null::uuid as course_id, null::uuid as week_id,
         k.archived_at, k.archived_by
    from kosks k where k.archived_at is not null
  union all
  select 'course', c.id, c.title, c.kosk_id, c.madrasah_id, c.id, null::uuid,
         c.archived_at, c.archived_by
    from courses c where c.archived_at is not null
  union all
  select 'week', w.id, w.title, c.kosk_id, c.madrasah_id, c.id, w.id,
         w.archived_at, w.archived_by
    from course_weeks w join courses c on c.id = w.course_id
   where w.archived_at is not null and c.archived_at is null
  union all
  select 'session', l.id, l.title, c.kosk_id, c.madrasah_id, c.id, w.id,
         l.archived_at, l.archived_by
    from lessons l
    join course_weeks w on w.id = l.week_id
    join courses c on c.id = w.course_id
   where l.archived_at is not null and w.archived_at is null and c.archived_at is null
  union all
  select 'deck', d.id, d.title, d.kosk_id, null::uuid, null::uuid, null::uuid,
         d.archived_at, d.archived_by
    from decks d where d.archived_at is not null
`;

/** `%` and `_` in a search are the person's characters, not wildcards. */
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;

type IArchiveRow = {
  type: ArchiveItemType;
  id: string;
  title: string;
  kosk_id: string | null;
  kosk_name: string | null;
  madrasah_id: string | null;
  madrasah_name: string | null;
  course_id: string | null;
  course_title: string | null;
  week_number: number | null;
  scheduled_at: Date | null;
  week_count: number | null;
  session_count: number | null;
  student_count: number | null;
  archived_at: Date;
  archived_by: string | null;
};

@Injectable()
export class ArchiveRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  private where(
    filter: IArchiveFilter & { id?: string; types?: readonly string[] }
  ) {
    const parts = [sql`true`];
    if (filter.id) parts.push(sql`h.id = ${filter.id}`);
    if (filter.koskId) parts.push(sql`h.kosk_id = ${filter.koskId}`);
    if (filter.madrasahId) {
      parts.push(sql`h.madrasah_id = ${filter.madrasahId}`);
    }
    if (filter.type) parts.push(sql`h.type = ${filter.type}`);
    if (filter.types) {
      parts.push(
        sql`h.type in (${sql.join(
          filter.types.map((t) => sql`${t}`),
          sql`, `
        )})`
      );
    }
    if (filter.q) {
      parts.push(sql`h.title ilike ${likePattern(filter.q)} escape '\\'`);
    }
    return sql.join(parts, sql` and `);
  }

  async count(
    filter: IArchiveFilter & { types?: readonly string[] }
  ): Promise<number> {
    const result = await this.db.execute<{ n: number }>(
      sql`select count(*)::int as n from (${HIDDEN}) h where ${this.where(filter)}`
    );
    return result.rows[0]?.n ?? 0;
  }

  /** How many hidden items of each type match; a type with none is left out. */
  async countByType(
    filter: IArchiveFilter & { types?: readonly string[] }
  ): Promise<Map<ArchiveItemType, number>> {
    const result = await this.db.execute<{ type: ArchiveItemType; n: number }>(
      sql`select h.type, count(*)::int as n from (${HIDDEN}) h where ${this.where(filter)} group by h.type`
    );
    return new Map(result.rows.map((r) => [r.type, r.n]));
  }

  /** Newest hidden first. */
  async list(
    filter: IArchiveFilter & { id?: string; types?: readonly string[] },
    limit: number,
    offset: number
  ): Promise<IArchiveItem[]> {
    const result = await this.db.execute<IArchiveRow>(sql`
      select h.type, h.id, h.title,
             h.kosk_id, k.name as kosk_name,
             h.madrasah_id, m.name as madrasah_name,
             h.course_id, c.title as course_title,
             w.week_number,
             case when h.type = 'session'
                  then (select l.scheduled_at from lessons l where l.id = h.id) end as scheduled_at,
             case when h.type = 'course'
                  then (select count(*)::int from course_weeks cw
                         where cw.course_id = h.id and cw.archived_at is null) end as week_count,
             case when h.type = 'week'
                  then (select count(*)::int from lessons wl
                         where wl.week_id = h.id and wl.archived_at is null) end as session_count,
             case when h.type = 'course'
                  then (select count(*)::int from enrollments e
                         where e.course_id = h.id and e.status = 'ENROLLED') end as student_count,
             h.archived_at, h.archived_by
        from (${HIDDEN}) h
        left join kosks k on k.id = h.kosk_id
        left join madrasahs m on m.id = h.madrasah_id
        left join courses c on c.id = h.course_id
        left join course_weeks w on w.id = h.week_id
       where ${this.where(filter)}
       order by h.archived_at desc, h.id
       limit ${limit} offset ${offset}
    `);
    return result.rows.map((r) => ({
      type: r.type,
      id: r.id,
      title: r.title,
      koskId: r.kosk_id,
      koskName: r.kosk_name,
      madrasahId: r.madrasah_id,
      madrasahName: r.madrasah_name,
      courseId: r.course_id,
      courseTitle: r.course_title,
      weekNumber: r.week_number,
      scheduledAt: r.scheduled_at,
      weekCount: r.week_count,
      sessionCount: r.session_count,
      studentCount: r.student_count,
      archivedAt: r.archived_at,
      archivedBy: r.archived_by,
    }));
  }

  /** One hidden item, or null when it is missing, shown, or has no storage. */
  async findOne(
    type: ArchiveItemType,
    id: string
  ): Promise<IArchiveItem | null> {
    if (!STORED_ARCHIVE_ITEM_TYPES.includes(type)) return null;
    const [item] = await this.list({ type, id }, 1, 0);
    return item ?? null;
  }

  /** The köşks and medreses that hold something hidden, for the platform archive's scope filter. */
  async scopes(): Promise<IArchiveScopes> {
    const result = await this.db.execute<{
      kind: "kosk" | "madrasah";
      id: string;
      name: string;
    }>(sql`
      select 'kosk' as kind, k.id, k.name from kosks k
       where k.id in (select h.kosk_id from (${HIDDEN}) h where h.kosk_id is not null)
      union all
      select 'madrasah', m.id, m.name from madrasahs m
       where m.id in (select h.madrasah_id from (${HIDDEN}) h where h.madrasah_id is not null)
      order by 3
    `);
    return {
      kosks: result.rows
        .filter((r) => r.kind === "kosk")
        .map(({ id, name }) => ({ id, name })),
      madrasahs: result.rows
        .filter((r) => r.kind === "madrasah")
        .map(({ id, name }) => ({ id, name })),
    };
  }

  /**
   * Names and roles of the people who hid the given items. The role is the one
   * the hider holds — or held, revoked rows count — where the item sits,
   * nearest scope first (`ARCHIVER_ROLE_ORDER`); SYSTEM_ADMIN holds none.
   */
  async archivers(items: IArchiveItem[]): Promise<Map<string, IArchiver>> {
    const byId = new Map<string, IArchiver>();
    const ids = [
      ...new Set(
        items.map((i) => i.archivedBy).filter((x): x is string => x !== null)
      ),
    ];
    if (ids.length === 0) return byId;

    const people = await this.db
      .select({
        id: users.id,
        givenName: users.givenName,
        familyName: users.familyName,
      })
      .from(users)
      .where(inArray(users.id, ids));
    const names = new Map(
      people.map((p) => [
        p.id,
        [p.givenName, p.familyName].filter(Boolean).join(" ").trim() || null,
      ])
    );

    const scopeIds = [
      ...new Set(
        items.flatMap((i) =>
          [i.koskId, i.madrasahId, i.courseId].filter(
            (x): x is string => x !== null
          )
        )
      ),
    ];
    const held =
      scopeIds.length === 0
        ? []
        : await this.db
            .select({
              userId: roleAssignments.userId,
              role: roleAssignments.role,
              scopeId: roleAssignments.scopeId,
            })
            .from(roleAssignments)
            .where(
              and(
                inArray(roleAssignments.userId, ids),
                inArray(roleAssignments.scopeId, scopeIds)
              )
            );

    for (const item of items) {
      if (item.archivedBy === null) continue;
      const scopes = new Set(
        [item.koskId, item.madrasahId, item.courseId].filter(Boolean)
      );
      const roles = new Set(
        held
          .filter((h) => h.userId === item.archivedBy && scopes.has(h.scopeId))
          .map((h) => h.role)
      );
      byId.set(`${item.type}:${item.id}`, {
        id: item.archivedBy,
        name: names.get(item.archivedBy) ?? null,
        role: ARCHIVER_ROLE_ORDER.find((r) => roles.has(r)) ?? null,
      });
    }
    return byId;
  }

  async restore(type: ArchiveItemType, id: string): Promise<RestoreOutcome> {
    return this.db.transaction(async (tx) => {
      switch (type) {
        case "course":
          return this.restoreCourse(tx, id);
        case "week":
          return this.restoreWeek(tx, id);
        case "session":
          return this.restoreSession(tx, id);
        case "kosk":
          return this.restoreSimple(tx, kosks, id, kosks.name);
        case "deck":
          return this.restoreSimple(tx, decks, id, decks.title);
        default:
          return { status: "not-found" };
      }
    });
  }

  private async restoreSimple(
    tx: Tx,
    table: typeof kosks | typeof decks,
    id: string,
    titleColumn: typeof kosks.name | typeof decks.title
  ): Promise<RestoreOutcome> {
    const [row] = await tx
      .update(table)
      .set({ archivedAt: null, archivedBy: null, updatedAt: new Date() })
      .where(and(eq(table.id, id), isNotNull(table.archivedAt)))
      .returning({ title: titleColumn });
    return row
      ? { status: "restored", title: row.title }
      : { status: "not-found" };
  }

  private async restoreCourse(tx: Tx, id: string): Promise<RestoreOutcome> {
    const [course] = await tx
      .select({
        title: courses.title,
        koskArchivedAt: kosks.archivedAt,
        madrasahArchivedAt: madrasahs.archivedAt,
      })
      .from(courses)
      .innerJoin(kosks, eq(kosks.id, courses.koskId))
      .leftJoin(madrasahs, eq(madrasahs.id, courses.madrasahId))
      .where(and(eq(courses.id, id), isNotNull(courses.archivedAt)))
      .for("update", { of: courses });
    if (!course) return { status: "not-found" };
    // A course hidden with its medrese comes back with the medrese.
    if (course.koskArchivedAt !== null || course.madrasahArchivedAt !== null) {
      return { status: "parent-hidden" };
    }
    await tx
      .update(courses)
      .set({
        archivedAt: null,
        archivedBy: null,
        version: sql`${courses.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(courses.id, id));
    return { status: "restored", title: course.title };
  }

  private async restoreWeek(tx: Tx, id: string): Promise<RestoreOutcome> {
    const [week] = await tx
      .select({
        title: courseWeeks.title,
        courseId: courseWeeks.courseId,
        archivedAt: courseWeeks.archivedAt,
        courseArchivedAt: courses.archivedAt,
      })
      .from(courseWeeks)
      .innerJoin(courses, eq(courses.id, courseWeeks.courseId))
      .where(and(eq(courseWeeks.id, id), isNotNull(courseWeeks.archivedAt)))
      .for("update", { of: courseWeeks });
    if (!week || week.archivedAt === null) return { status: "not-found" };
    if (week.courseArchivedAt !== null) return { status: "parent-hidden" };
    const now = new Date();
    // The sessions a whole-course save hid together with the week were hidden
    // at the same instant; one hidden on its own earlier stays hidden.
    await tx
      .update(lessons)
      .set({ archivedAt: null, archivedBy: null, updatedAt: now })
      .where(
        and(eq(lessons.weekId, id), eq(lessons.archivedAt, week.archivedAt))
      );
    await tx
      .update(courseWeeks)
      .set({ archivedAt: null, archivedBy: null, updatedAt: now })
      .where(eq(courseWeeks.id, id));
    await this.bumpCourseVersion(tx, week.courseId, now);
    return { status: "restored", title: week.title };
  }

  private async restoreSession(tx: Tx, id: string): Promise<RestoreOutcome> {
    const [lesson] = await tx
      .select({
        title: lessons.title,
        courseId: courses.id,
        weekArchivedAt: courseWeeks.archivedAt,
        courseArchivedAt: courses.archivedAt,
      })
      .from(lessons)
      .innerJoin(courseWeeks, eq(courseWeeks.id, lessons.weekId))
      .innerJoin(courses, eq(courses.id, courseWeeks.courseId))
      .where(and(eq(lessons.id, id), isNotNull(lessons.archivedAt)))
      .for("update", { of: lessons });
    if (!lesson) return { status: "not-found" };
    if (lesson.weekArchivedAt !== null || lesson.courseArchivedAt !== null) {
      return { status: "parent-hidden" };
    }
    const now = new Date();
    await tx
      .update(lessons)
      .set({ archivedAt: null, archivedBy: null, updatedAt: now })
      .where(eq(lessons.id, id));
    await this.bumpCourseVersion(tx, lesson.courseId, now);
    return { status: "restored", title: lesson.title };
  }

  /** A syllabus write bumps the course version so an editor holding the old one is refused (MDRS-95). */
  private async bumpCourseVersion(tx: Tx, courseId: string, now: Date) {
    await tx
      .update(courses)
      .set({ version: sql`${courses.version} + 1`, updatedAt: now })
      .where(eq(courses.id, courseId));
  }

  /** What a real delete of the item would take with it. Null when nothing hidden is there. */
  async impact(
    type: ArchiveItemType,
    id: string
  ): Promise<IArchiveImpact | null> {
    const item = await this.findOne(type, id);
    if (!item) return null;
    const counts = await this.db.execute<{
      courses: number;
      weeks: number;
      sessions: number;
      students: number;
      followers: number;
      cards: number;
    }>(sql`
      with scope_courses as (
        select c.id from courses c
         where (${type} = 'kosk' and c.kosk_id = ${id})
            or (${type} = 'course' and c.id = ${id})
            or (${type} in ('week', 'session') and c.id = ${item.courseId})
      ),
      scope_weeks as (
        select w.id from course_weeks w
         where (${type} in ('kosk', 'course') and w.course_id in (select id from scope_courses))
            or (${type} = 'week' and w.id = ${id})
      )
      select
        case when ${type} in ('kosk') then (select count(*)::int from scope_courses) else 0 end as courses,
        (select count(*)::int from scope_weeks) as weeks,
        case when ${type} = 'session' then 1
             else (select count(*)::int from lessons l where l.week_id in (select id from scope_weeks)) end as sessions,
        case when ${type} in ('kosk', 'course')
             then (select count(*)::int from enrollments e where e.course_id in (select id from scope_courses))
             else 0 end as students,
        case when ${type} = 'kosk'
             then (select count(*)::int from kosk_followers f where f.kosk_id = ${id})
             else 0 end as followers,
        case when ${type} = 'deck'
             then (select count(*)::int from flashcards f where f.deck_id = ${id})
             else 0 end as cards
    `);
    const row = counts.rows[0];
    return {
      type,
      id,
      title: item.title,
      courses: row?.courses ?? 0,
      weeks: row?.weeks ?? 0,
      sessions: row?.sessions ?? 0,
      students: row?.students ?? 0,
      recordings: 0,
      followers: row?.followers ?? 0,
      cards: row?.cards ?? 0,
    };
  }

  /**
   * The real delete of something hidden (MDRS-173): the item and every row
   * under it, children first, plus one `audit_log` entry naming who did it,
   * in one transaction. Only a hidden item is deleted; a shown one, or one that
   * is gone, is `false`. The foreign keys under a course are RESTRICT, so
   * nothing is taken implicitly.
   */
  async purge(
    type: ArchiveItemType,
    id: string,
    actor: { id: string; name: string | null }
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const details = await this.purgeRows(tx, type, id);
      if (!details) return false;
      await recordDeletion(tx, {
        actorId: actor.id,
        entity: type,
        entityId: id,
        details: { ...details, actorName: actor.name, fromArchive: true },
      });
      return true;
    });
  }

  private async purgeRows(
    tx: Tx,
    type: ArchiveItemType,
    id: string
  ): Promise<Record<string, unknown> | null> {
    switch (type) {
      case "course": {
        const [course] = await tx
          .select({ title: courses.title, koskId: courses.koskId })
          .from(courses)
          .where(and(eq(courses.id, id), isNotNull(courses.archivedAt)))
          .for("update");
        if (!course) return null;
        const removed = await purgeCourses(tx, [id]);
        return { title: course.title, koskId: course.koskId, removed };
      }
      case "kosk": {
        const [kosk] = await tx
          .select({ name: kosks.name })
          .from(kosks)
          .where(and(eq(kosks.id, id), isNotNull(kosks.archivedAt)))
          .for("update");
        if (!kosk) return null;
        const removed = await purgeCourses(tx, await courseIdsOfKosk(tx, id));
        const followers = (
          await tx
            .delete(koskFollowers)
            .where(eq(koskFollowers.koskId, id))
            .returning({ userId: koskFollowers.userId })
        ).length;
        const managers = await deleteAssignmentsIn(tx, SCOPE_TYPES.KOSK, [id]);
        await tx.delete(kosks).where(eq(kosks.id, id));
        return {
          name: kosk.name,
          managers,
          removed: { ...removed, followers },
        };
      }
      case "week": {
        const [week] = await tx
          .select({
            title: courseWeeks.title,
            courseId: courseWeeks.courseId,
          })
          .from(courseWeeks)
          .where(and(eq(courseWeeks.id, id), isNotNull(courseWeeks.archivedAt)))
          .for("update");
        if (!week) return null;
        // The record of e-mailed invitations (MDRS-121) goes with its sessions.
        await tx
          .delete(lessonInvitations)
          .where(
            inArray(
              lessonInvitations.lessonId,
              tx
                .select({ id: lessons.id })
                .from(lessons)
                .where(eq(lessons.weekId, id))
            )
          );
        const removedSessions = (
          await tx
            .delete(lessons)
            .where(eq(lessons.weekId, id))
            .returning({ id: lessons.id })
        ).length;
        await tx.delete(courseWeeks).where(eq(courseWeeks.id, id));
        await this.bumpCourseVersion(tx, week.courseId, new Date());
        return {
          title: week.title,
          courseId: week.courseId,
          removed: { weeks: 1, lessons: removedSessions },
        };
      }
      case "session": {
        const [lesson] = await tx
          .select({ title: lessons.title, weekId: lessons.weekId })
          .from(lessons)
          .where(and(eq(lessons.id, id), isNotNull(lessons.archivedAt)))
          .for("update");
        if (!lesson) return null;
        await tx
          .delete(lessonInvitations)
          .where(eq(lessonInvitations.lessonId, id));
        await tx.delete(lessons).where(eq(lessons.id, id));
        const [week] = await tx
          .select({ courseId: courseWeeks.courseId })
          .from(courseWeeks)
          .where(eq(courseWeeks.id, lesson.weekId));
        if (week) await this.bumpCourseVersion(tx, week.courseId, new Date());
        return {
          title: lesson.title,
          weekId: lesson.weekId,
          removed: { lessons: 1 },
        };
      }
      case "deck": {
        const [deck] = await tx
          .select({ title: decks.title })
          .from(decks)
          .where(and(eq(decks.id, id), isNotNull(decks.archivedAt)))
          .for("update");
        if (!deck) return null;
        const cards = (
          await tx
            .select({ id: flashcards.id })
            .from(flashcards)
            .where(eq(flashcards.deckId, id))
        ).length;
        // Progress rows point at a card by a plain column, not a foreign key,
        // so they do not cascade with it. Cards, labels and shares do.
        await tx
          .delete(flashcardProgress)
          .where(
            inArray(
              flashcardProgress.flashcardId,
              tx
                .select({ id: flashcards.id })
                .from(flashcards)
                .where(eq(flashcards.deckId, id))
            )
          );
        await tx.delete(decks).where(eq(decks.id, id));
        return { title: deck.title, removed: { decks: 1, flashcards: cards } };
      }
      default:
        return null;
    }
  }

  /** The name tedrisat last saw for the account, for the audit entry; null when none. */
  async displayName(userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ givenName: users.givenName, familyName: users.familyName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) return null;
    return (
      [row.givenName, row.familyName].filter(Boolean).join(" ").trim() || null
    );
  }

  /** Whether the köşk exists, for the köşk archive's 404. */
  async koskExists(id: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: kosks.id })
      .from(kosks)
      .where(eq(kosks.id, id))
      .limit(1);
    return Boolean(row);
  }
}
