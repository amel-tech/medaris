import { Injectable } from "@nestjs/common";
import { and, asc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { auditLog } from "../database/schema/audit.schema";
import { courses } from "../database/schema/course.schema";
import {
  integrationPartnerKosks,
  integrationPartners,
} from "../database/schema/integration-partner.schema";
import {
  partnerCourseCodes,
  partnerEnrollmentLinks,
} from "../database/schema/partner-enrollment.schema";
import {
  type IPartnerActor,
  partnerActorDetails,
} from "./domain/partner-actor";
import {
  PARTNER_CODE_ADD_ACTION,
  PARTNER_CODE_REMOVE_ACTION,
  PARTNER_ENROLL_ACTION,
} from "./domain/partner-enrollment";

export type IPartnerLink = typeof partnerEnrollmentLinks.$inferSelect;

/** A code staff map or take off, with who did it, for the audit row. */
export interface IPartnerCodeChange {
  partner: IPartnerActor;
  code: string;
  courseId: string;
  actorId: string;
}

/**
 * The partner's binding to the köşk a course is held in: the condition under
 * which its codes for that course are listed and honoured (the köşks a partner
 * works with, `integration_partner_kosks`, migration 0064).
 */
const boundToCourseKosk = (partnerClientId: unknown, courseKoskId: unknown) =>
  sql`exists (select 1 from ${integrationPartnerKosks} where ${integrationPartnerKosks.clientId} = ${partnerClientId} and ${integrationPartnerKosks.koskId} = ${courseKoskId})`;

/**
 * Partner enrollments' two tables (migration 0062): the codes mapped to
 * courses, and the links between a partner's registrations and the
 * enrollments they stand for. The enrollments themselves are written by the
 * course's own paths, never here. A code counts only in a course of a köşk
 * its partner is bound to; the reads below say so where it matters.
 */
@Injectable()
export class PartnerRepository {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  // ---- codes -----------------------------------------------------------------

  /**
   * The course this partner's code is mapped to, or null, also when the
   * course's köşk is not one the partner is bound to: a code mapped there
   * before the köşk was unbound enrols nobody.
   */
  async findCodeCourse(
    partnerClientId: string,
    code: string
  ): Promise<string | null> {
    const [row] = await this.db
      .select({ courseId: partnerCourseCodes.courseId })
      .from(partnerCourseCodes)
      .innerJoin(courses, eq(courses.id, partnerCourseCodes.courseId))
      .where(
        and(
          eq(partnerCourseCodes.partnerClientId, partnerClientId),
          eq(partnerCourseCodes.code, code),
          boundToCourseKosk(partnerClientId, courses.koskId)
        )
      )
      .limit(1);
    return row?.courseId ?? null;
  }

  /** Whether the course is held in a köşk the partner is bound to. */
  async isCourseBound(
    partnerClientId: string,
    courseId: string
  ): Promise<boolean> {
    const [row] = await this.db
      .select({ id: courses.id })
      .from(courses)
      .where(
        and(
          eq(courses.id, courseId),
          boundToCourseKosk(partnerClientId, courses.koskId)
        )
      )
      .limit(1);
    return row !== undefined;
  }

  /**
   * Every code of one partner in the köşks it is bound to, with its course's
   * title, by code.
   */
  async listPartnerCodes(
    partnerClientId: string
  ): Promise<{ code: string; courseId: string; title: string }[]> {
    return this.db
      .select({
        code: partnerCourseCodes.code,
        courseId: partnerCourseCodes.courseId,
        title: courses.title,
      })
      .from(partnerCourseCodes)
      .innerJoin(courses, eq(courses.id, partnerCourseCodes.courseId))
      .where(
        and(
          eq(partnerCourseCodes.partnerClientId, partnerClientId),
          boundToCourseKosk(partnerClientId, courses.koskId)
        )
      )
      .orderBy(asc(partnerCourseCodes.code));
  }

  /**
   * The partners of a course: the enabled ones bound to the köşk it is held
   * in, by name. What Ders ayarları lists, and the only ones its staff may
   * map a code for.
   */
  async coursePartners(
    courseId: string
  ): Promise<{ clientId: string; name: string }[]> {
    return this.db
      .select({
        clientId: integrationPartners.clientId,
        name: integrationPartners.name,
      })
      .from(courses)
      .innerJoin(
        integrationPartnerKosks,
        eq(integrationPartnerKosks.koskId, courses.koskId)
      )
      .innerJoin(
        integrationPartners,
        eq(integrationPartners.clientId, integrationPartnerKosks.clientId)
      )
      .where(
        and(eq(courses.id, courseId), eq(integrationPartners.enabled, true))
      )
      .orderBy(
        asc(integrationPartners.name),
        asc(integrationPartners.clientId)
      );
  }

  /** Every partner's codes for one course, oldest first. */
  async listCourseCodes(
    courseId: string
  ): Promise<{ partnerClientId: string; code: string; createdAt: Date }[]> {
    return this.db
      .select({
        partnerClientId: partnerCourseCodes.partnerClientId,
        code: partnerCourseCodes.code,
        createdAt: partnerCourseCodes.createdAt,
      })
      .from(partnerCourseCodes)
      .where(eq(partnerCourseCodes.courseId, courseId))
      .orderBy(asc(partnerCourseCodes.createdAt), asc(partnerCourseCodes.code));
  }

  /**
   * Maps a code to a course, with its audit row, in one transaction. `exists`
   * when it is mapped to this course already, `taken` when to another one.
   */
  async addCode(
    change: IPartnerCodeChange
  ): Promise<{ result: "added" | "exists" | "taken"; createdAt: Date }> {
    return this.db.transaction(async (tx) => {
      const [added] = await tx
        .insert(partnerCourseCodes)
        .values({
          partnerClientId: change.partner.clientId,
          code: change.code,
          courseId: change.courseId,
          createdBy: change.actorId,
        })
        .onConflictDoNothing()
        .returning();
      if (added) {
        await tx.insert(auditLog).values({
          actorId: change.actorId,
          action: PARTNER_CODE_ADD_ACTION,
          entity: "course",
          entityId: change.courseId,
          details: {
            ...partnerActorDetails(change.partner),
            code: change.code,
          },
        });
        return { result: "added" as const, createdAt: added.createdAt };
      }
      const [held] = await tx
        .select()
        .from(partnerCourseCodes)
        .where(
          and(
            eq(partnerCourseCodes.partnerClientId, change.partner.clientId),
            eq(partnerCourseCodes.code, change.code)
          )
        )
        .limit(1);
      return {
        result:
          held && held.courseId === change.courseId
            ? ("exists" as const)
            : ("taken" as const),
        createdAt: held?.createdAt ?? new Date(),
      };
    });
  }

  /** Takes a code off this course, with its audit row; false when it was not on it. */
  async removeCode(change: IPartnerCodeChange): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const removed = await tx
        .delete(partnerCourseCodes)
        .where(
          and(
            eq(partnerCourseCodes.partnerClientId, change.partner.clientId),
            eq(partnerCourseCodes.code, change.code),
            eq(partnerCourseCodes.courseId, change.courseId)
          )
        )
        .returning({ id: partnerCourseCodes.id });
      if (removed.length === 0) return false;
      await tx.insert(auditLog).values({
        actorId: change.actorId,
        action: PARTNER_CODE_REMOVE_ACTION,
        entity: "course",
        entityId: change.courseId,
        details: { ...partnerActorDetails(change.partner), code: change.code },
      });
      return true;
    });
  }

  // ---- links -----------------------------------------------------------------

  async findLink(
    partnerClientId: string,
    registrationRef: string,
    courseCode: string
  ): Promise<IPartnerLink | null> {
    const [link] = await this.db
      .select()
      .from(partnerEnrollmentLinks)
      .where(
        and(
          eq(partnerEnrollmentLinks.partnerClientId, partnerClientId),
          eq(partnerEnrollmentLinks.registrationRef, registrationRef),
          eq(partnerEnrollmentLinks.courseCode, courseCode)
        )
      )
      .limit(1);
    return link ?? null;
  }

  /**
   * Makes the link, or hands back the one a concurrent call made first; the
   * unique key decides. `inserted` is whether this call made it.
   */
  async claimLink(values: {
    partnerClientId: string;
    registrationRef: string;
    courseCode: string;
    courseId: string;
    userId: string;
  }): Promise<{ link: IPartnerLink; inserted: boolean }> {
    const [inserted] = await this.db
      .insert(partnerEnrollmentLinks)
      .values(values)
      .onConflictDoNothing()
      .returning();
    if (inserted) return { link: inserted, inserted: true };
    const held = await this.findLink(
      values.partnerClientId,
      values.registrationRef,
      values.courseCode
    );
    if (!held) throw new Error("partner link vanished while it was claimed");
    return { link: held, inserted: false };
  }

  /** A link this call made for a seat that was refused: it links nothing. */
  async deleteLink(id: string): Promise<void> {
    await this.db
      .delete(partnerEnrollmentLinks)
      .where(eq(partnerEnrollmentLinks.id, id));
  }

  /**
   * The link now owns the seat it stands for (`created_enrollment`), the row
   * whose `created_at` is given. Only ever raised: an open link that owns a
   * seat keeps it when a later PUT finds them enrolled already.
   */
  async markCreated(id: string, enrollmentCreatedAt: Date): Promise<void> {
    await this.db
      .update(partnerEnrollmentLinks)
      .set({ createdEnrollment: true, enrollmentCreatedAt })
      .where(eq(partnerEnrollmentLinks.id, id));
  }

  /** A closed link a new PUT opens again, for the course its code maps to now. */
  async reopenLink(
    id: string,
    courseId: string,
    owned: { enrollmentCreatedAt: Date } | null
  ): Promise<void> {
    await this.db
      .update(partnerEnrollmentLinks)
      .set({
        courseId,
        closedAt: null,
        createdEnrollment: owned !== null,
        enrollmentCreatedAt: owned?.enrollmentCreatedAt ?? null,
        enrollmentRemovedAt: null,
      })
      .where(eq(partnerEnrollmentLinks.id, id));
  }

  /**
   * Closes the link. `createdEnrollment` records what the DELETE did (true:
   * the seat was taken away, or was gone; false: it stayed), which a repeat
   * of it answers again.
   */
  async closeLink(
    id: string,
    outcome: { createdEnrollment: boolean; enrollmentRemovedAt?: Date | null }
  ): Promise<void> {
    await this.db
      .update(partnerEnrollmentLinks)
      .set({
        closedAt: new Date(),
        createdEnrollment: outcome.createdEnrollment,
        enrollmentRemovedAt: outcome.enrollmentRemovedAt ?? null,
      })
      .where(eq(partnerEnrollmentLinks.id, id));
  }

  /** Another open link, of any partner, for the same person in the same course. */
  async findOtherOpenLink(
    courseId: string,
    userId: string,
    exceptId: string
  ): Promise<IPartnerLink | null> {
    const [link] = await this.db
      .select()
      .from(partnerEnrollmentLinks)
      .where(
        and(
          eq(partnerEnrollmentLinks.courseId, courseId),
          eq(partnerEnrollmentLinks.userId, userId),
          ne(partnerEnrollmentLinks.id, exceptId),
          isNull(partnerEnrollmentLinks.closedAt)
        )
      )
      .orderBy(asc(partnerEnrollmentLinks.createdAt))
      .limit(1);
    return link ?? null;
  }

  /**
   * The seat passes from a link being closed to another open one, which will
   * take it away when its own registration is cancelled; the closed one kept
   * it.
   */
  async handOver(
    fromId: string,
    toId: string,
    enrollmentCreatedAt: Date
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(partnerEnrollmentLinks)
        .set({ createdEnrollment: true, enrollmentCreatedAt })
        .where(eq(partnerEnrollmentLinks.id, toId));
      await tx
        .update(partnerEnrollmentLinks)
        .set({ closedAt: new Date(), createdEnrollment: false })
        .where(eq(partnerEnrollmentLinks.id, fromId));
    });
  }

  /**
   * The moments the integration took this person's seat in this course away
   * (`enrollment_removed_at` of the closed links that did), for telling
   * whether a REVOKED seat is still exactly as the integration left it.
   */
  async findRemovals(courseId: string, userId: string): Promise<Date[]> {
    const rows = await this.db
      .select({ at: partnerEnrollmentLinks.enrollmentRemovedAt })
      .from(partnerEnrollmentLinks)
      .where(
        and(
          eq(partnerEnrollmentLinks.courseId, courseId),
          eq(partnerEnrollmentLinks.userId, userId),
          isNotNull(partnerEnrollmentLinks.enrollmentRemovedAt)
        )
      );
    return rows.flatMap((row) => (row.at ? [row.at] : []));
  }

  /** One `enrollment.partner_add` row for a seat a registration added or gave back. */
  async recordEnrollment(entry: {
    partner: IPartnerActor;
    actorId: string;
    courseId: string;
    details: Record<string, unknown>;
  }): Promise<void> {
    await this.db.insert(auditLog).values({
      actorId: entry.actorId,
      action: PARTNER_ENROLL_ACTION,
      entity: "course",
      entityId: entry.courseId,
      details: { ...partnerActorDetails(entry.partner), ...entry.details },
    });
  }
}
