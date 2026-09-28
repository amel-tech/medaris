import { Injectable } from "@nestjs/common";
import { and, asc, eq, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { kosks } from "../database/schema/kosk.schema";
import { madrasahNazirs, madrasahs } from "../database/schema/madrasah.schema";
import {
  ICreateMadrasah,
  IMadrasah,
  IMadrasahWithNazirs,
  IUpdateMadrasah,
} from "./madrasah.repository.interface";

@Injectable()
export class MadrasahRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  private withNazirsSelect() {
    return {
      madrasah: madrasahs,
      // `::text` so node-postgres parses the array; it has no parser for
      // uuid[] and would hand back the literal "{…}" string.
      nazirIds: sql<
        string[]
      >`coalesce((select array_agg(n.user_id::text order by n.created_at, n.user_id) from ${madrasahNazirs} n where n.madrasah_id = "madrasahs"."id"), '{}')`,
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

  /** Nazır rows cascade; affiliated köşks are set standalone by the FK. */
  async delete(id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(madrasahs)
      .where(eq(madrasahs.id, id))
      .returning({ id: madrasahs.id });
    return deleted.length > 0;
  }

  async isNazir(madrasahId: string, userId: string): Promise<boolean> {
    const rows = await this.db
      .select({ userId: madrasahNazirs.userId })
      .from(madrasahNazirs)
      .where(
        and(
          eq(madrasahNazirs.madrasahId, madrasahId),
          eq(madrasahNazirs.userId, userId)
        )
      )
      .limit(1);
    return rows.length > 0;
  }

  /** True if `userId` is a nazır of the medrese `koskId` is affiliated with. */
  async isNazirOfKosk(koskId: string, userId: string): Promise<boolean> {
    const rows = await this.db
      .select({ userId: madrasahNazirs.userId })
      .from(kosks)
      .innerJoin(
        madrasahNazirs,
        eq(madrasahNazirs.madrasahId, kosks.madrasahId)
      )
      .where(and(eq(kosks.id, koskId), eq(madrasahNazirs.userId, userId)))
      .limit(1);
    return rows.length > 0;
  }

  async addNazir(madrasahId: string, userId: string): Promise<void> {
    await this.db
      .insert(madrasahNazirs)
      .values({ madrasahId, userId })
      .onConflictDoNothing();
  }

  async removeNazir(madrasahId: string, userId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(madrasahNazirs)
      .where(
        and(
          eq(madrasahNazirs.madrasahId, madrasahId),
          eq(madrasahNazirs.userId, userId)
        )
      )
      .returning({ userId: madrasahNazirs.userId });
    return deleted.length > 0;
  }
}
