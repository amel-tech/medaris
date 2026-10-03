import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { holdsIn } from "../database/role-assignments";
import { auditLog } from "../database/schema/audit.schema";
import { courses } from "../database/schema/course.schema";
import { courseRequests } from "../database/schema/course-request.schema";
import { kosks } from "../database/schema/kosk.schema";
import { madrasahs } from "../database/schema/madrasah.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
} from "../database/schema/role-assignment.schema";
import { users } from "../database/schema/user.schema";

export interface ICourseRequest {
  id: string;
  title: string;
  reason: string;
  status: string;
  kosk: { id: string; name: string };
  madrasah: { id: string; name: string };
  requestedBy: { id: string; name: string | null };
  createdAt: Date;
  decidedAt: Date | null;
  rejectReason: string | null;
  courseId: string | null;
}

export interface ICourseRequestCounts {
  pending: number;
  decided: number;
}

const nameOf = (
  given: string | null,
  family: string | null,
  email: string | null
): string | null =>
  [given, family].filter(Boolean).join(" ").trim() || email || null;

@Injectable()
export class CourseRequestRepository {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  private select() {
    return this.db
      .select({
        id: courseRequests.id,
        title: courseRequests.title,
        reason: courseRequests.reason,
        status: courseRequests.status,
        koskId: courseRequests.koskId,
        koskName: kosks.name,
        madrasahId: courseRequests.madrasahId,
        madrasahName: madrasahs.name,
        requestedBy: courseRequests.requestedBy,
        givenName: users.givenName,
        familyName: users.familyName,
        email: users.email,
        createdAt: courseRequests.createdAt,
        decidedAt: courseRequests.decidedAt,
        rejectReason: courseRequests.rejectReason,
        courseId: courseRequests.courseId,
      })
      .from(courseRequests)
      .innerJoin(kosks, eq(kosks.id, courseRequests.koskId))
      .innerJoin(madrasahs, eq(madrasahs.id, courseRequests.madrasahId))
      .leftJoin(users, eq(users.id, courseRequests.requestedBy));
  }

  private toItem(r: {
    id: string;
    title: string;
    reason: string;
    status: string;
    koskId: string;
    koskName: string;
    madrasahId: string;
    madrasahName: string;
    requestedBy: string;
    givenName: string | null;
    familyName: string | null;
    email: string | null;
    createdAt: Date;
    decidedAt: Date | null;
    rejectReason: string | null;
    courseId: string | null;
  }): ICourseRequest {
    return {
      id: r.id,
      title: r.title,
      reason: r.reason,
      status: r.status,
      kosk: { id: r.koskId, name: r.koskName },
      madrasah: { id: r.madrasahId, name: r.madrasahName },
      requestedBy: {
        id: r.requestedBy,
        name: nameOf(r.givenName, r.familyName, r.email),
      },
      createdAt: r.createdAt,
      decidedAt: r.decidedAt,
      rejectReason: r.rejectReason,
      courseId: r.courseId,
    };
  }

  async list(
    koskId: string,
    tab: "PENDING" | "DECIDED",
    limit: number
  ): Promise<ICourseRequest[]> {
    const rows = await this.select()
      .where(
        and(
          eq(courseRequests.koskId, koskId),
          tab === "PENDING"
            ? eq(courseRequests.status, "PENDING")
            : ne(courseRequests.status, "PENDING")
        )
      )
      .orderBy(
        tab === "PENDING"
          ? asc(courseRequests.createdAt)
          : desc(courseRequests.decidedAt),
        asc(courseRequests.id)
      )
      .limit(limit);
    return rows.map((r) => this.toItem(r));
  }

  async counts(koskId: string): Promise<ICourseRequestCounts> {
    const [row] = await this.db
      .select({
        pending:
          sql<number>`count(*) filter (where ${courseRequests.status} = 'PENDING')`.mapWith(
            Number
          ),
        decided:
          sql<number>`count(*) filter (where ${courseRequests.status} <> 'PENDING')`.mapWith(
            Number
          ),
      })
      .from(courseRequests)
      .where(eq(courseRequests.koskId, koskId));
    return { pending: row?.pending ?? 0, decided: row?.decided ?? 0 };
  }

  async find(id: string): Promise<ICourseRequest | null> {
    const [row] = await this.select().where(eq(courseRequests.id, id));
    return row ? this.toItem(row) : null;
  }

  /** Whether the user is a başmüderris of the medrese now. */
  async isHeadMuderris(userId: string, madrasahId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: roleAssignments.id })
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.userId, userId),
          holdsIn(ASSIGNED_ROLES.MEDRESE_BASMUDERRIS, madrasahId)
        )
      )
      .limit(1);
    return rows.length > 0;
  }

  async madrasahExists(madrasahId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: madrasahs.id })
      .from(madrasahs)
      .where(eq(madrasahs.id, madrasahId));
    return rows.length > 0;
  }

  async courseInKosk(courseId: string, koskId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: courses.id })
      .from(courses)
      .where(and(eq(courses.id, courseId), eq(courses.koskId, koskId)));
    return rows.length > 0;
  }

  async create(input: {
    koskId: string;
    madrasahId: string;
    title: string;
    reason: string;
    requestedBy: string;
  }): Promise<string> {
    const [row] = await this.db
      .insert(courseRequests)
      .values(input)
      .returning({ id: courseRequests.id });
    return row.id;
  }

  /** Answers a waiting request, once, with its audit row in the same transaction; false when it was answered meanwhile. */
  async decide(input: {
    id: string;
    actorId: string;
    outcome: "ACCEPTED" | "REJECTED";
    rejectReason?: string;
    courseId?: string;
    title: string;
    koskId: string;
    madrasahId: string;
  }): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const updated = await tx
        .update(courseRequests)
        .set({
          status: input.outcome,
          decidedBy: input.actorId,
          decidedAt: sql`now()`,
          rejectReason: input.rejectReason ?? null,
          courseId: input.courseId ?? null,
        })
        .where(
          and(
            eq(courseRequests.id, input.id),
            eq(courseRequests.status, "PENDING")
          )
        )
        .returning({ id: courseRequests.id });
      if (updated.length === 0) return false;
      await tx.insert(auditLog).values({
        actorId: input.actorId,
        action:
          input.outcome === "ACCEPTED"
            ? "course_request.accept"
            : "course_request.reject",
        entity: "course_request",
        entityId: input.id,
        details: {
          title: input.title,
          koskId: input.koskId,
          madrasahId: input.madrasahId,
          ...(input.courseId ? { courseId: input.courseId } : {}),
          ...(input.rejectReason ? { reason: input.rejectReason } : {}),
        },
      });
      return true;
    });
  }
}
