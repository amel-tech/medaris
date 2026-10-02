import { Injectable } from "@nestjs/common";
import { and, asc, eq, gt, inArray, isNull, min, sql } from "drizzle-orm";
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
  courseWeeks,
  enrollments,
  lessons,
} from "../database/schema/course.schema";
import { kosks } from "../database/schema/kosk.schema";
import { madrasahs } from "../database/schema/madrasah.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
  SCOPE_TYPES,
} from "../database/schema/role-assignment.schema";
import { users } from "../database/schema/user.schema";
import {
  ICreateMadrasah,
  IMadrasah,
  IMadrasahCourse,
  IMadrasahExplore,
  IMadrasahExploreFilter,
  IMadrasahHeadMuderris,
  IMadrasahOverview,
  IMadrasahWithNazirs,
  IUpdateMadrasah,
} from "./madrasah.repository.interface";

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
  constructor(private readonly databaseService: DatabaseService) {}

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
      .orderBy(asc(madrasahs.name), asc(madrasahs.id))
      .limit(limit)
      .offset(offset);
    return rows.map((r) => this.toWithNazirs(r));
  }

  async count(): Promise<number> {
    const [row] = await this.db
      .select({ value: sql<number>`count(*)`.mapWith(Number) })
      .from(madrasahs);
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
   * and its courses stay in their köşks with no medrese (`SET NULL`).
   */
  async delete(id: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const deleted = await tx
        .delete(madrasahs)
        .where(eq(madrasahs.id, id))
        .returning({ id: madrasahs.id });
      if (deleted.length === 0) return false;
      await deleteAssignmentsIn(tx, SCOPE_TYPES.MADRASAH, [id]);
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

  /**
   * Locks the medrese row first: `scope_id` is no foreign key, so without the
   * lock a grant racing SYSTEM_ADMIN's delete could commit after it and leave
   * a role in a medrese that no longer exists. False when there is none.
   */
  async addNazir(
    madrasahId: string,
    userId: string,
    actorId: string
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [madrasah] = await tx
        .select({ id: madrasahs.id })
        .from(madrasahs)
        .where(eq(madrasahs.id, madrasahId))
        .for("no key update");
      if (!madrasah) return false;
      await grantRole(tx, {
        userId,
        role: NAZIR_ROLE,
        scopeId: madrasahId,
        grantedBy: actorId,
      });
      return true;
    });
  }

  /** Revoked in the actor's name, not deleted (MDRS-134). */
  async removeNazir(
    madrasahId: string,
    userId: string,
    actorId: string
  ): Promise<boolean> {
    return this.db.transaction((tx) =>
      revokeRole(tx, {
        userId,
        role: NAZIR_ROLE,
        scopeId: madrasahId,
        revokedBy: actorId,
      })
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
   * medrese in listed köşks — an unlisted köşk is in no list (MDRS-122) — each
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
  ): Promise<{ courseId: string; status: EnrollmentStatus }[]> {
    if (ids.length === 0 || userId === null) return [];
    return this.db
      .select({ courseId: enrollments.courseId, status: enrollments.status })
      .from(enrollments)
      .where(
        and(eq(enrollments.userId, userId), inArray(enrollments.courseId, ids))
      );
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
