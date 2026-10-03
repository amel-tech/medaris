import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { isHeld } from "../database/role-assignments";
import { flashcards } from "../database/schema/flashcard.schema";
import { decks } from "../database/schema/flashcard-deck.schema";
import { koskApplications } from "../database/schema/kosk-application.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
} from "../database/schema/role-assignment.schema";
import { users } from "../database/schema/user.schema";
import { DeckPublishStatus } from "../flashcard/domain/deck-publish-status.enum";

const nameOf = (
  given: string | null,
  family: string | null,
  email: string | null
): string | null =>
  [given, family].filter(Boolean).join(" ").trim() || email || null;

export interface IPlatformNumbers {
  kosk: number;
  unlistedKosk: number;
  madrasah: number;
  course: number;
  enrolledStudents: number;
}

/** The reads under the Medaris home page (MDRS-182, nizam/01 and 05) that no other module already has. */
@Injectable()
export class NizamDashboardRepository {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /** Whether the user holds the Medaris nazımı role now. */
  async isMedarisNazim(userId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: roleAssignments.id })
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.userId, userId),
          eq(roleAssignments.role, ASSIGNED_ROLES.MEDARIS_NAZIM),
          isHeld()
        )
      )
      .limit(1);
    return rows.length > 0;
  }

  /** Köşk applications still waiting, and the newest of them (the card lists three). */
  async applications(limit: number): Promise<{
    count: number;
    latest: {
      id: string;
      name: string;
      field: string;
      applicantName: string | null;
      createdAt: Date;
    }[];
  }> {
    const [counted] = await this.db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(koskApplications)
      .where(eq(koskApplications.status, "PENDING"));
    const rows = await this.db
      .select({
        id: koskApplications.id,
        name: koskApplications.name,
        field: koskApplications.field,
        createdAt: koskApplications.createdAt,
        givenName: users.givenName,
        familyName: users.familyName,
        email: users.email,
      })
      .from(koskApplications)
      .leftJoin(users, eq(users.id, koskApplications.applicantId))
      .where(eq(koskApplications.status, "PENDING"))
      .orderBy(desc(koskApplications.createdAt), asc(koskApplications.id))
      .limit(limit);
    return {
      count: counted?.n ?? 0,
      latest: rows.map((r) => ({
        id: r.id,
        name: r.name,
        field: r.field,
        applicantName: nameOf(r.givenName, r.familyName, r.email),
        createdAt: r.createdAt,
      })),
    };
  }

  /** Deck publish requests still waiting, and the newest of them. */
  async deckRequests(limit: number): Promise<{
    count: number;
    latest: {
      id: string;
      title: string;
      ownerName: string | null;
      cardCount: number;
      requestedAt: Date;
    }[];
  }> {
    const waiting = and(
      isNull(decks.archivedAt),
      eq(decks.publishStatus, DeckPublishStatus.PENDING)
    );
    const [counted] = await this.db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(decks)
      .where(waiting);
    const rows = await this.db
      .select({
        id: decks.id,
        title: decks.title,
        requestedAt: decks.publishRequestedAt,
        createdAt: decks.createdAt,
        cardCount:
          sql<number>`(select count(*) from ${flashcards} f where f.deck_id = "decks"."id")`.mapWith(
            Number
          ),
        givenName: users.givenName,
        familyName: users.familyName,
        email: users.email,
      })
      .from(decks)
      .leftJoin(users, eq(users.id, decks.authorId))
      .where(waiting)
      .orderBy(desc(decks.publishRequestedAt), asc(decks.id))
      .limit(limit);
    return {
      count: counted?.n ?? 0,
      latest: rows.map((r) => ({
        id: r.id,
        title: r.title,
        ownerName: nameOf(r.givenName, r.familyName, r.email),
        cardCount: r.cardCount,
        requestedAt: r.requestedAt ?? r.createdAt,
      })),
    };
  }

  async givenNameOf(userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ givenName: users.givenName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row?.givenName?.trim() || null;
  }

  /**
   * The platform's numbers, hidden köşks, medreses and courses left out.
   * A course counts only while its köşk is shown; the talebe are counted once
   * each, whatever number of courses they sit in.
   */
  async platformNumbers(): Promise<IPlatformNumbers> {
    const result = await this.db.execute<{
      kosk: string;
      unlisted: string;
      madrasah: string;
      course: string;
      students: string;
    }>(sql`
      select
        (select count(*) from kosks k where k.archived_at is null) as kosk,
        (select count(*) from kosks k
          where k.archived_at is null and k.is_private) as unlisted,
        (select count(*) from madrasahs m where m.archived_at is null) as madrasah,
        (select count(*) from courses c
           join kosks k on k.id = c.kosk_id
          where c.archived_at is null and k.archived_at is null) as course,
        (select count(distinct e.user_id) from enrollments e
           join courses c on c.id = e.course_id
           join kosks k on k.id = c.kosk_id
          where c.archived_at is null and k.archived_at is null
            and e.status = 'ENROLLED') as students`);
    const row = result.rows[0];
    return {
      kosk: Number(row?.kosk ?? 0),
      unlistedKosk: Number(row?.unlisted ?? 0),
      madrasah: Number(row?.madrasah ?? 0),
      course: Number(row?.course ?? 0),
      enrolledStudents: Number(row?.students ?? 0),
    };
  }
}
