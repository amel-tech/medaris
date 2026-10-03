import { Injectable } from "@nestjs/common";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  type SQL,
  sql,
} from "drizzle-orm";
import { DatabaseService } from "../../database/database.service";
import {
  isHeld,
  setCourseImam,
  syncMuderrisAssignments,
} from "../../database/role-assignments";
import { auditLog } from "../../database/schema/audit.schema";
import { courseMuderris, courses } from "../../database/schema/course.schema";
import { kosks } from "../../database/schema/kosk.schema";
import {
  madrasahSettings,
  madrasahs,
} from "../../database/schema/madrasah.schema";
import { offsiteCourseRequests } from "../../database/schema/offsite-course-request.schema";
import {
  ASSIGNED_ROLES,
  madrasahKoskHosting,
  roleAssignments,
} from "../../database/schema/role-assignment.schema";
import { users } from "../../database/schema/user.schema";
import type {
  HideMadrasahCourseResult,
  IMadrasahHostingKosk,
  INewOffsiteCourseRequest,
  IOffsiteCourseRequest,
  IOpenMadrasahCourse,
  ISetCourseMuderris,
  NewOffsiteCourseRequestResult,
  OpenMadrasahCourseResult,
} from "./madrasah-course.repository.interface";

/**
 * The medrese's own courses (nazir/07, 08, 17, 18): opening one in a köşk that
 * hosts the medrese, changing who teaches it, hiding it; and its requests for
 * a course outside it (nazir/09). Each write is one transaction with its audit
 * row.
 */
@Injectable()
export class MadrasahCourseRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /** The köşks that hold a hosting right for the medrese, by name; a hidden köşk is left out. */
  async findHostingKosks(madrasahId: string): Promise<IMadrasahHostingKosk[]> {
    const rows = await this.db
      .select({ id: kosks.id, name: kosks.name, field: kosks.field })
      .from(madrasahKoskHosting)
      .innerJoin(kosks, eq(kosks.id, madrasahKoskHosting.koskId))
      .where(
        and(
          eq(madrasahKoskHosting.madrasahId, madrasahId),
          isNull(madrasahKoskHosting.revokedAt),
          isNull(kosks.archivedAt)
        )
      )
      .orderBy(asc(kosks.name), asc(kosks.id));
    if (rows.length === 0) return [];
    const counts = await this.db
      .select({
        koskId: courses.koskId,
        n: sql<number>`count(*)`.mapWith(Number),
      })
      .from(courses)
      .where(
        and(
          eq(courses.madrasahId, madrasahId),
          isNull(courses.archivedAt),
          inArray(
            courses.koskId,
            rows.map((r) => r.id)
          )
        )
      )
      .groupBy(courses.koskId);
    const countOf = new Map(counts.map((c) => [c.koskId, c.n]));
    return rows.map((r) => ({ ...r, courseCount: countOf.get(r.id) ?? 0 }));
  }

  /**
   * The accounts the course lists as müderris, lowercased, or null when it is
   * not a course of the medrese that is still shown.
   */
  async findMuderrisUserIds(
    madrasahId: string,
    courseId: string
  ): Promise<string[] | null> {
    const [course] = await this.db
      .select({ id: courses.id })
      .from(courses)
      .where(
        and(
          eq(courses.id, courseId),
          eq(courses.madrasahId, madrasahId),
          isNull(courses.archivedAt)
        )
      )
      .limit(1);
    if (!course) return null;
    const rows = await this.db
      .select({ userId: courseMuderris.userId })
      .from(courseMuderris)
      .where(eq(courseMuderris.courseId, courseId));
    return rows.flatMap((r) => (r.userId ? [r.userId.toLowerCase()] : []));
  }

  /**
   * Opens a DRAFT course of the medrese in the köşk (nazir/08), with its
   * müderrisler and imam. The medrese's policies are applied here, under the
   * medrese's lock, so one saved a moment ago cannot be missed: "Kayıt her
   * zaman onaylı" makes the course wait for approval and "Kapalı ders zorunlu"
   * makes it closed, whatever was asked.
   */
  async open(input: IOpenMadrasahCourse): Promise<OpenMadrasahCourseResult> {
    return this.db.transaction(async (tx) => {
      const [madrasah] = await tx
        .select({ id: madrasahs.id })
        .from(madrasahs)
        .where(
          and(eq(madrasahs.id, input.madrasahId), isNull(madrasahs.archivedAt))
        )
        .for("no key update");
      if (!madrasah) return { status: "madrasah-not-found" };

      // Held, so a withdrawal that commits first is seen and one that comes
      // after waits for this course to exist.
      const [right] = await tx
        .select({ id: madrasahKoskHosting.id })
        .from(madrasahKoskHosting)
        .where(
          and(
            eq(madrasahKoskHosting.madrasahId, input.madrasahId),
            eq(madrasahKoskHosting.koskId, input.koskId),
            isNull(madrasahKoskHosting.revokedAt)
          )
        )
        .for("share");
      const [kosk] = await tx
        .select({ id: kosks.id })
        .from(kosks)
        .where(and(eq(kosks.id, input.koskId), isNull(kosks.archivedAt)));
      if (!right || !kosk) return { status: "no-hosting-right" };

      const [policies] = await tx
        .select({
          alwaysApproval: madrasahSettings.policyAlwaysApproval,
          closedCourseRequired: madrasahSettings.policyClosedCourseRequired,
        })
        .from(madrasahSettings)
        .where(eq(madrasahSettings.madrasahId, input.madrasahId));
      const requiresApproval =
        input.requiresApproval || (policies?.alwaysApproval ?? false);
      const closed = input.closed || (policies?.closedCourseRequired ?? false);

      const [course] = await tx
        .insert(courses)
        .values({
          koskId: input.koskId,
          madrasahId: input.madrasahId,
          authorId: input.actorId,
          title: input.title,
          requiresApproval,
          isClosed: closed,
        })
        .returning({ id: courses.id });
      await tx.insert(courseMuderris).values(
        input.muderris.map((m, i) => ({
          courseId: course.id,
          userId: m.userId,
          name: m.name ?? m.userId,
          orderIndex: i,
        }))
      );
      await syncMuderrisAssignments(tx, course.id, input.actorId);
      await setCourseImam(tx, course.id, input.imamUserId);
      await tx.insert(auditLog).values({
        actorId: input.actorId,
        action: "course.open",
        entity: "course",
        entityId: course.id,
        details: {
          madrasahId: input.madrasahId,
          koskId: input.koskId,
          title: input.title,
          muderrisUserIds: input.muderris.map((m) => m.userId),
          imamUserId: input.imamUserId,
          requiresApproval,
          closed,
        },
      });
      return { status: "opened", courseId: course.id };
    });
  }

  /**
   * Replaces the course's müderrisler (nazir/17): accounts that leave the list
   * lose their row and their MUDERRIS role, new ones get both, the imam is the
   * one named. A müderris shown by name alone, with no account, is not in the
   * list and is left as it is. The course's version moves, so an editor that
   * opened it before is refused (MDRS-95). A request that changes neither the
   * accounts nor the imam writes nothing. False when the course is not one of
   * the medrese's that is still shown.
   */
  async setMuderris(input: ISetCourseMuderris): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [course] = await tx
        .select({ id: courses.id })
        .from(courses)
        .where(
          and(
            eq(courses.id, input.courseId),
            eq(courses.madrasahId, input.madrasahId),
            isNull(courses.archivedAt)
          )
        )
        .for("update");
      if (!course) return false;

      const rows = await tx
        .select({ id: courseMuderris.id, userId: courseMuderris.userId })
        .from(courseMuderris)
        .where(eq(courseMuderris.courseId, input.courseId));
      const [imam] = await tx
        .select({ userId: roleAssignments.userId })
        .from(roleAssignments)
        .where(
          and(
            eq(roleAssignments.role, ASSIGNED_ROLES.MUDERRIS),
            eq(roleAssignments.scopeId, input.courseId),
            eq(roleAssignments.isImam, true),
            isHeld()
          )
        )
        .limit(1);

      const listed = input.muderris.map((m) => m.userId);
      const stored = rows.flatMap((r) =>
        r.userId ? [r.userId.toLowerCase()] : []
      );
      if (
        stored.length === listed.length &&
        listed.every((id) => stored.includes(id)) &&
        imam?.userId === input.imamUserId
      ) {
        return true;
      }

      const dropped = rows.filter(
        (r) => r.userId && !listed.includes(r.userId.toLowerCase())
      );
      if (dropped.length > 0) {
        await tx.delete(courseMuderris).where(
          inArray(
            courseMuderris.id,
            dropped.map((r) => r.id)
          )
        );
      }
      for (const [i, m] of input.muderris.entries()) {
        const row = rows.find((r) => r.userId?.toLowerCase() === m.userId);
        if (row) {
          await tx
            .update(courseMuderris)
            .set({ orderIndex: i })
            .where(eq(courseMuderris.id, row.id));
        } else {
          await tx.insert(courseMuderris).values({
            courseId: input.courseId,
            userId: m.userId,
            name: m.name ?? m.userId,
            orderIndex: i,
          });
        }
      }
      await tx
        .update(courses)
        .set({ version: sql`${courses.version} + 1`, updatedAt: new Date() })
        .where(eq(courses.id, input.courseId));
      await syncMuderrisAssignments(tx, input.courseId, input.actorId);
      await setCourseImam(tx, input.courseId, input.imamUserId);
      await tx.insert(auditLog).values({
        actorId: input.actorId,
        action: "course.muderris.update",
        entity: "course",
        entityId: input.courseId,
        details: {
          madrasahId: input.madrasahId,
          from: { userIds: stored, imamUserId: imam?.userId ?? null },
          to: { userIds: listed, imamUserId: input.imamUserId },
        },
      });
      return true;
    });
  }

  /**
   * Hides a course of the medrese (nazir/18): `archived_at` and `archived_by`
   * are stamped and the version moves, as `CourseRepository.archive` does, and
   * nothing is deleted. The first hider's stamp is never overwritten, so the
   * kademe rule of the archive keeps judging the one who hid it first.
   */
  async hideCourse(
    madrasahId: string,
    courseId: string,
    actorId: string
  ): Promise<HideMadrasahCourseResult> {
    return this.db.transaction(async (tx) => {
      const [course] = await tx
        .select({ title: courses.title, archivedAt: courses.archivedAt })
        .from(courses)
        .where(
          and(eq(courses.id, courseId), eq(courses.madrasahId, madrasahId))
        )
        .for("update");
      if (!course) return "not-found";
      if (course.archivedAt) return "already-hidden";
      const now = new Date();
      await tx
        .update(courses)
        .set({
          archivedAt: now,
          archivedBy: actorId,
          version: sql`${courses.version} + 1`,
          updatedAt: now,
        })
        .where(eq(courses.id, courseId));
      await tx.insert(auditLog).values({
        actorId,
        action: "course.hide",
        entity: "course",
        entityId: courseId,
        details: { madrasahId, title: course.title },
      });
      return "hidden";
    });
  }

  /**
   * Records the medrese's request that a köşk open a course outside it
   * (nazir/09), as PENDING, with its audit row. Nothing else is written: no
   * course exists until the köşk's nazım opens one.
   */
  async createOffsiteRequest(
    input: INewOffsiteCourseRequest
  ): Promise<NewOffsiteCourseRequestResult> {
    return this.db.transaction(async (tx) => {
      const [madrasah] = await tx
        .select({ id: madrasahs.id })
        .from(madrasahs)
        .where(
          and(eq(madrasahs.id, input.madrasahId), isNull(madrasahs.archivedAt))
        )
        .for("share");
      if (!madrasah) return { status: "madrasah-not-found" };
      const [kosk] = await tx
        .select({ id: kosks.id })
        .from(kosks)
        .where(and(eq(kosks.id, input.koskId), isNull(kosks.archivedAt)))
        .for("share");
      if (!kosk) return { status: "kosk-not-found" };

      const [created] = await tx
        .insert(offsiteCourseRequests)
        .values({
          madrasahId: input.madrasahId,
          koskId: input.koskId,
          title: input.title,
          reason: input.reason,
          requestedBy: input.actorId,
        })
        .returning({ id: offsiteCourseRequests.id });
      await tx.insert(auditLog).values({
        actorId: input.actorId,
        action: "offsite_course_request.create",
        entity: "offsite_course_request",
        entityId: created.id,
        details: {
          madrasahId: input.madrasahId,
          koskId: input.koskId,
          title: input.title,
          reason: input.reason,
        },
      });
      const [request] = await this.offsiteRequests(
        eq(offsiteCourseRequests.id, created.id),
        tx
      );
      return { status: "created", request };
    });
  }

  /** The medrese's requests for a course outside it, newest first. */
  findOffsiteRequests(madrasahId: string): Promise<IOffsiteCourseRequest[]> {
    return this.offsiteRequests(
      eq(offsiteCourseRequests.madrasahId, madrasahId)
    );
  }

  private async offsiteRequests(
    where: SQL,
    executor: Pick<typeof this.db, "select"> = this.db
  ): Promise<IOffsiteCourseRequest[]> {
    const rows = await executor
      .select({
        id: offsiteCourseRequests.id,
        madrasahId: offsiteCourseRequests.madrasahId,
        koskId: offsiteCourseRequests.koskId,
        koskName: kosks.name,
        title: offsiteCourseRequests.title,
        reason: offsiteCourseRequests.reason,
        status: offsiteCourseRequests.status,
        requestedById: offsiteCourseRequests.requestedBy,
        givenName: users.givenName,
        familyName: users.familyName,
        createdAt: offsiteCourseRequests.createdAt,
      })
      .from(offsiteCourseRequests)
      .innerJoin(kosks, eq(kosks.id, offsiteCourseRequests.koskId))
      .leftJoin(users, eq(users.id, offsiteCourseRequests.requestedBy))
      .where(where)
      .orderBy(
        desc(offsiteCourseRequests.createdAt),
        desc(offsiteCourseRequests.id)
      );
    return rows.map(({ givenName, familyName, ...row }) => ({
      ...row,
      requestedByName:
        [givenName, familyName].filter(Boolean).join(" ").trim() || null,
    }));
  }
}
