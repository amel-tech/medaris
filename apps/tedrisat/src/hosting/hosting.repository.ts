import { Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, isNull, type SQL, sql } from "drizzle-orm";
import { EnrollmentStatus } from "../course/domain/enrollment-status.enum";
import { DatabaseService } from "../database/database.service";
import { isHeld } from "../database/role-assignments";
import { auditLog } from "../database/schema/audit.schema";
import {
  courseMuderris,
  courses,
  enrollments,
} from "../database/schema/course.schema";
import { madrasahs } from "../database/schema/madrasah.schema";
import {
  ASSIGNED_ROLES,
  madrasahKoskHosting,
  roleAssignments,
} from "../database/schema/role-assignment.schema";
import { users } from "../database/schema/user.schema";
import { MadrasahNotFoundError } from "../madrasah/errors/madrasah-not-found.error";
import type { CoursesAction } from "./dto/hosting-right.dto";
import { HostingRightNotFoundError } from "./errors/hosting-right-not-found.error";

export type GrantedByRole = "SYSTEM_ADMIN" | "MEDARIS_NAZIM" | "KOSK_NAZIM";

export interface IHostingRight {
  madrasahId: string;
  name: string;
  handle: string;
  coverHue: number;
  headMuderris: { id: string; name: string | null } | null;
  grantedBy: { id: string; name: string | null; role: GrantedByRole | null };
  grantedAt: Date;
  openCourses: {
    id: string;
    title: string;
    status: "DRAFT" | "PUBLISHED";
    studentCount: number;
    imamName: string | null;
  }[];
}

const nameOf = (u: { given: string | null; family: string | null }) =>
  [u.given, u.family].filter(Boolean).join(" ").trim() || null;

/** A köşk's hosting rights (MDRS-170): who may open courses here (`madrasah_kosk_hosting`). */
@Injectable()
export class HostingRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /**
   * The held rights of the köşk, oldest first, each with what the withdrawal
   * dialog needs: the medrese's başmüderris, who granted and in what role, and
   * its courses here that are not hidden with their talebe and imam. A hidden
   * medrese holds nothing visible. A few small reads over the ids, not one
   * wide join, so a course with many müderrisler does not multiply rows.
   */
  async list(
    koskId: string,
    onlyMadrasahId?: string
  ): Promise<IHostingRight[]> {
    const conditions: SQL[] = [
      eq(madrasahKoskHosting.koskId, koskId),
      isNull(madrasahKoskHosting.revokedAt),
      isNull(madrasahs.archivedAt),
    ];
    if (onlyMadrasahId) {
      conditions.push(eq(madrasahKoskHosting.madrasahId, onlyMadrasahId));
    }
    const rights = await this.db
      .select({
        madrasahId: madrasahs.id,
        name: madrasahs.name,
        handle: madrasahs.handle,
        coverHue: madrasahs.coverHue,
        grantedBy: madrasahKoskHosting.grantedBy,
        grantedByRole: madrasahKoskHosting.grantedByRole,
        grantedAt: madrasahKoskHosting.createdAt,
      })
      .from(madrasahKoskHosting)
      .innerJoin(madrasahs, eq(madrasahs.id, madrasahKoskHosting.madrasahId))
      .where(and(...conditions))
      .orderBy(asc(madrasahKoskHosting.createdAt), asc(madrasahs.name));
    if (rights.length === 0) return [];

    const madrasahIds = rights.map((r) => r.madrasahId);
    const courseRows = await this.db
      .select({
        id: courses.id,
        title: courses.title,
        status: courses.status,
        madrasahId: courses.madrasahId,
      })
      .from(courses)
      .where(
        and(
          eq(courses.koskId, koskId),
          inArray(courses.madrasahId, madrasahIds),
          isNull(courses.archivedAt)
        )
      )
      .orderBy(asc(courses.title), asc(courses.id));
    const courseIds = courseRows.map((c) => c.id);

    const [students, imams, heads, people] = await Promise.all([
      this.studentCounts(courseIds),
      this.imamNames(courseIds),
      this.headMuderrisIds(madrasahIds),
      this.names(rights.map((r) => r.grantedBy)),
    ]);
    const headNames = await this.names([...heads.values()]);

    return rights.map((r) => {
      const headId = heads.get(r.madrasahId);
      return {
        madrasahId: r.madrasahId,
        name: r.name,
        handle: r.handle,
        coverHue: r.coverHue,
        headMuderris: headId
          ? { id: headId, name: headNames.get(headId) ?? null }
          : null,
        grantedBy: {
          id: r.grantedBy,
          name: people.get(r.grantedBy) ?? null,
          role:
            r.grantedByRole === "SYSTEM_ADMIN" ||
            r.grantedByRole === "MEDARIS_NAZIM" ||
            r.grantedByRole === "KOSK_NAZIM"
              ? r.grantedByRole
              : null,
        },
        grantedAt: r.grantedAt,
        openCourses: courseRows
          .filter((c) => c.madrasahId === r.madrasahId)
          .map((c) => ({
            id: c.id,
            title: c.title,
            status: c.status as "DRAFT" | "PUBLISHED",
            studentCount: students.get(c.id) ?? 0,
            imamName: imams.get(c.id) ?? null,
          })),
      };
    });
  }

  private async studentCounts(
    courseIds: string[]
  ): Promise<Map<string, number>> {
    if (courseIds.length === 0) return new Map();
    const rows = await this.db
      .select({
        courseId: enrollments.courseId,
        n: sql<number>`count(*)`.mapWith(Number),
      })
      .from(enrollments)
      .where(
        and(
          inArray(enrollments.courseId, courseIds),
          eq(enrollments.status, EnrollmentStatus.ENROLLED)
        )
      )
      .groupBy(enrollments.courseId);
    return new Map(rows.map((r) => [r.courseId, r.n]));
  }

  /** Each course's imam by the name its müderris row carries. */
  private async imamNames(courseIds: string[]): Promise<Map<string, string>> {
    if (courseIds.length === 0) return new Map();
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
          inArray(roleAssignments.scopeId, courseIds),
          isHeld()
        )
      );
    if (imams.length === 0) return new Map();
    const rows = await this.db
      .select({
        courseId: courseMuderris.courseId,
        userId: courseMuderris.userId,
        name: courseMuderris.name,
      })
      .from(courseMuderris)
      .where(inArray(courseMuderris.courseId, courseIds))
      .orderBy(asc(courseMuderris.orderIndex), asc(courseMuderris.id));
    const result = new Map<string, string>();
    for (const imam of imams) {
      const row = rows.find(
        (r) => r.courseId === imam.courseId && r.userId === imam.userId
      );
      if (row && imam.courseId) result.set(imam.courseId, row.name);
    }
    return result;
  }

  /** The oldest held başmüderris of each medrese. */
  private async headMuderrisIds(
    madrasahIds: string[]
  ): Promise<Map<string, string>> {
    const rows = await this.db
      .select({
        madrasahId: roleAssignments.scopeId,
        userId: roleAssignments.userId,
      })
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.role, ASSIGNED_ROLES.MEDRESE_BASMUDERRIS),
          inArray(roleAssignments.scopeId, madrasahIds),
          isHeld()
        )
      )
      .orderBy(asc(roleAssignments.createdAt), asc(roleAssignments.userId));
    const result = new Map<string, string>();
    for (const row of rows) {
      if (row.madrasahId && !result.has(row.madrasahId)) {
        result.set(row.madrasahId, row.userId);
      }
    }
    return result;
  }

  private async names(ids: string[]): Promise<Map<string, string | null>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.db
      .select({
        id: users.id,
        given: users.givenName,
        family: users.familyName,
      })
      .from(users)
      .where(inArray(users.id, unique));
    return new Map(rows.map((r) => [r.id, nameOf(r)]));
  }

  /**
   * Gives the medrese a hosting right in the köşk, unless it holds one, in one
   * transaction with the audit row. The medrese row is locked first so the
   * grant cannot race its hiding; a hidden or missing medrese is not found.
   */
  async grant(
    koskId: string,
    madrasahId: string,
    actor: { id: string; role: GrantedByRole }
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [madrasah] = await tx
        .select({ id: madrasahs.id })
        .from(madrasahs)
        .where(and(eq(madrasahs.id, madrasahId), isNull(madrasahs.archivedAt)))
        .for("no key update");
      if (!madrasah) throw new MadrasahNotFoundError(madrasahId);
      const inserted = await tx
        .insert(madrasahKoskHosting)
        .values({
          madrasahId,
          koskId,
          grantedBy: actor.id,
          grantedByRole: actor.role,
        })
        .onConflictDoNothing()
        .returning({ id: madrasahKoskHosting.id });
      if (inserted.length === 0) return;
      await tx.insert(auditLog).values({
        actorId: actor.id,
        action: "hosting_right.grant",
        entity: "kosk",
        entityId: koskId,
        details: { madrasahId, grantedByRole: actor.role },
      });
    });
  }

  /**
   * Withdraws the right in the actor's name (the row stays as history). The
   * medrese's courses here follow `coursesAction`: KEEP leaves them as they
   * are, HIDE hides each (stamp and version bump, like `course.archive`) so
   * they leave every list and come back from the archive. All in one
   * transaction with the audit row, which names what was hidden.
   */
  async revoke(
    koskId: string,
    madrasahId: string,
    coursesAction: CoursesAction,
    actorId: string
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const revoked = await tx
        .update(madrasahKoskHosting)
        .set({ revokedAt: sql`now()`, revokedBy: actorId })
        .where(
          and(
            eq(madrasahKoskHosting.koskId, koskId),
            eq(madrasahKoskHosting.madrasahId, madrasahId),
            isNull(madrasahKoskHosting.revokedAt)
          )
        )
        .returning({ id: madrasahKoskHosting.id });
      if (revoked.length === 0) {
        throw new HostingRightNotFoundError(koskId, madrasahId);
      }
      let hidden: string[] = [];
      if (coursesAction === "HIDE") {
        const now = new Date();
        const rows = await tx
          .update(courses)
          .set({
            archivedAt: now,
            archivedBy: actorId,
            version: sql`${courses.version} + 1`,
            updatedAt: now,
          })
          .where(
            and(
              eq(courses.koskId, koskId),
              eq(courses.madrasahId, madrasahId),
              isNull(courses.archivedAt)
            )
          )
          .returning({ id: courses.id });
        hidden = rows.map((r) => r.id);
      }
      await tx.insert(auditLog).values({
        actorId,
        action: "hosting_right.revoke",
        entity: "kosk",
        entityId: koskId,
        details: { madrasahId, coursesAction, hiddenCourseIds: hidden },
      });
    });
  }
}
