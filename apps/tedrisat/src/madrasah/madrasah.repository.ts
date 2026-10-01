import { Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { EnrollmentStatus } from "../course/domain/enrollment-status.enum";
import { DatabaseService } from "../database/database.service";
import {
  deleteAssignmentsIn,
  grantRole,
  holderIdsOf,
  holdsIn,
  revokeRole,
} from "../database/role-assignments";
import { courses, enrollments } from "../database/schema/course.schema";
import { madrasahs } from "../database/schema/madrasah.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
  SCOPE_TYPES,
} from "../database/schema/role-assignment.schema";
import {
  ICreateMadrasah,
  IMadrasah,
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
}
