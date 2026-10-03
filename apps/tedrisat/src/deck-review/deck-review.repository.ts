import { Injectable } from "@nestjs/common";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import type { HideLevel } from "../archive/hide-level";
import { DatabaseService } from "../database/database.service";
import { holdsIn } from "../database/role-assignments";
import { auditLog } from "../database/schema/audit.schema";
import { courses } from "../database/schema/course.schema";
import { deckProposals } from "../database/schema/deck-proposal.schema";
import { flashcards } from "../database/schema/flashcard.schema";
import { decks } from "../database/schema/flashcard-deck.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
} from "../database/schema/role-assignment.schema";
import { users } from "../database/schema/user.schema";
import { DeckPublishStatus } from "../flashcard/domain/deck-publish-status.enum";
import { FlashcardType } from "../flashcard/domain/flashcard-type.enum";

export interface IPerson {
  id: string;
  name: string | null;
}

export interface IPublishRequest {
  id: string;
  title: string;
  description: string | null;
  cardType: FlashcardType;
  cardCount: number;
  owner: IPerson;
  requestedAt: Date;
  outcome: "PENDING" | "PUBLISHED" | "REJECTED";
  decidedAt: Date | null;
  rejectReason: string | null;
}

export interface IRequestCounts {
  pending: number;
  decided: number;
}

export interface IKoskDeck {
  id: string;
  title: string;
  description: string | null;
  cardType: FlashcardType;
  cardCount: number;
  updatedAt: Date;
}

export interface IDeckProposal {
  id: string;
  koskId: string;
  title: string;
  description: string | null;
  cardType: FlashcardType;
  proposedBy: IPerson;
  courseTitle: string | null;
  status: string;
  createdAt: Date;
}

export interface INewKoskDeck {
  koskId: string;
  authorId: string;
  title: string;
  description?: string;
  cardType: FlashcardType;
}

const nameOf = (
  given: string | null,
  family: string | null,
  email: string | null
): string | null =>
  [given, family].filter(Boolean).join(" ").trim() || email || null;

/** Thrown inside the deck transaction to roll it back. */
class ProposalAnswered extends Error {}

@Injectable()
export class DeckReviewRepository {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  private readonly cardCount =
    sql<number>`(select count(*) from ${flashcards} f where f.deck_id = "decks"."id")`.mapWith(
      Number
    );

  // ---- publish requests (nizam/16) ----

  async countRequests(): Promise<IRequestCounts> {
    const [row] = await this.db
      .select({
        pending:
          sql<number>`count(*) filter (where ${decks.publishStatus} = ${DeckPublishStatus.PENDING})`.mapWith(
            Number
          ),
        decided:
          sql<number>`count(*) filter (where ${decks.publishStatus} in (${DeckPublishStatus.PUBLISHED}, ${DeckPublishStatus.REJECTED}) and ${decks.publishDecidedAt} is not null)`.mapWith(
            Number
          ),
      })
      .from(decks)
      .where(isNull(decks.archivedAt));
    return { pending: row?.pending ?? 0, decided: row?.decided ?? 0 };
  }

  async listRequests(
    status: "PENDING" | "DECIDED",
    limit: number,
    offset: number
  ): Promise<IPublishRequest[]> {
    const pending = status === "PENDING";
    const rows = await this.db
      .select({
        id: decks.id,
        title: decks.title,
        description: decks.description,
        cardType: decks.cardType,
        cardCount: this.cardCount,
        authorId: decks.authorId,
        givenName: users.givenName,
        familyName: users.familyName,
        email: users.email,
        requestedAt: decks.publishRequestedAt,
        publishStatus: decks.publishStatus,
        decidedAt: decks.publishDecidedAt,
        rejectReason: decks.publishRejectReason,
      })
      .from(decks)
      .leftJoin(users, eq(users.id, decks.authorId))
      .where(
        and(
          isNull(decks.archivedAt),
          pending
            ? eq(decks.publishStatus, DeckPublishStatus.PENDING)
            : and(
                inArray(decks.publishStatus, [
                  DeckPublishStatus.PUBLISHED,
                  DeckPublishStatus.REJECTED,
                ]),
                isNotNull(decks.publishDecidedAt)
              )
        )
      )
      .orderBy(
        pending ? asc(decks.publishRequestedAt) : desc(decks.publishDecidedAt),
        asc(decks.id)
      )
      .limit(limit)
      .offset(offset);
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      cardType: r.cardType,
      cardCount: r.cardCount,
      owner: {
        id: r.authorId,
        name: nameOf(r.givenName, r.familyName, r.email),
      },
      // A decided deck keeps no request time; its decision time stands in.
      requestedAt: r.requestedAt ?? r.decidedAt ?? new Date(0),
      outcome: pending
        ? "PENDING"
        : r.publishStatus === DeckPublishStatus.PUBLISHED
          ? "PUBLISHED"
          : "REJECTED",
      decidedAt: r.decidedAt,
      rejectReason: r.rejectReason,
    }));
  }

  async findDeck(id: string) {
    const [row] = await this.db
      .select({
        id: decks.id,
        title: decks.title,
        authorId: decks.authorId,
        koskId: decks.koskId,
        publishStatus: decks.publishStatus,
        archivedAt: decks.archivedAt,
      })
      .from(decks)
      .where(eq(decks.id, id))
      .limit(1);
    return row ?? null;
  }

  async cards(
    deckId: string,
    limit?: number
  ): Promise<{ id: string; front: string; back: string }[]> {
    const query = this.db
      .select({
        id: flashcards.id,
        front: flashcards.contentFront,
        back: flashcards.contentBack,
      })
      .from(flashcards)
      .where(eq(flashcards.deckId, deckId))
      .orderBy(asc(flashcards.createdAt), asc(flashcards.id));
    return limit === undefined ? query : query.limit(limit);
  }

  async countCards(deckId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(flashcards)
      .where(eq(flashcards.deckId, deckId));
    return row?.n ?? 0;
  }

  /** Writes one `audit_log` row: somebody read what was private. */
  async audit(entry: {
    actorId: string;
    action: string;
    entityId: string;
    details: Record<string, unknown>;
  }): Promise<void> {
    await this.db.insert(auditLog).values({ ...entry, entity: "deck" });
  }

  /** PENDING to PUBLISHED; false when the request is not waiting any more. */
  async approve(id: string, by: string): Promise<boolean> {
    const rows = await this.db
      .update(decks)
      .set({
        isPublic: true,
        publishStatus: DeckPublishStatus.PUBLISHED,
        publishRequestedAt: null,
        publishDecidedAt: new Date(),
        publishDecidedBy: by,
        publishRejectReason: null,
      })
      .where(
        and(
          eq(decks.id, id),
          eq(decks.publishStatus, DeckPublishStatus.PENDING)
        )
      )
      .returning({ id: decks.id });
    return rows.length > 0;
  }

  /** PENDING to REJECTED; false when the request is not waiting any more. */
  async reject(id: string, by: string, reason: string): Promise<boolean> {
    const rows = await this.db
      .update(decks)
      .set({
        publishStatus: DeckPublishStatus.REJECTED,
        publishRequestedAt: null,
        publishDecidedAt: new Date(),
        publishDecidedBy: by,
        publishRejectReason: reason,
      })
      .where(
        and(
          eq(decks.id, id),
          eq(decks.publishStatus, DeckPublishStatus.PENDING)
        )
      )
      .returning({ id: decks.id });
    return rows.length > 0;
  }

  async displayName(userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({
        givenName: users.givenName,
        familyName: users.familyName,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row ? nameOf(row.givenName, row.familyName, row.email) : null;
  }

  // ---- köşk decks (nizam/30, 35) ----

  async listKoskDecks(
    koskId: string,
    limit: number,
    offset: number
  ): Promise<IKoskDeck[]> {
    return this.db
      .select({
        id: decks.id,
        title: decks.title,
        description: decks.description,
        cardType: decks.cardType,
        cardCount: this.cardCount,
        updatedAt: decks.updatedAt,
      })
      .from(decks)
      .where(and(eq(decks.koskId, koskId), isNull(decks.archivedAt)))
      .orderBy(desc(decks.updatedAt), asc(decks.id))
      .limit(limit)
      .offset(offset);
  }

  /** Every shown deck of the köşk, whatever page is read. */
  async countKoskDecks(koskId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(decks)
      .where(and(eq(decks.koskId, koskId), isNull(decks.archivedAt)));
    return row?.n ?? 0;
  }

  /**
   * Opens the köşk's deck. Given a proposal, the same transaction accepts it;
   * a proposal answered in the meantime rolls the deck back and this answers
   * `null`.
   */
  async createKoskDeck(
    deck: INewKoskDeck,
    proposalId: string | undefined,
    decidedBy: string
  ): Promise<{ id: string } | null> {
    try {
      return await this.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(decks)
          .values({
            authorId: deck.authorId,
            koskId: deck.koskId,
            title: deck.title,
            description: deck.description,
            cardType: deck.cardType,
            isPublic: false,
            publishStatus: DeckPublishStatus.PRIVATE,
          })
          .returning({ id: decks.id });
        if (proposalId) {
          const accepted = await tx
            .update(deckProposals)
            .set({
              status: "ACCEPTED",
              decidedBy,
              decidedAt: new Date(),
              deckId: created.id,
            })
            .where(
              and(
                eq(deckProposals.id, proposalId),
                eq(deckProposals.koskId, deck.koskId),
                eq(deckProposals.status, "PENDING")
              )
            )
            .returning({ id: deckProposals.id });
          if (accepted.length === 0) throw new ProposalAnswered();
        }
        return created;
      });
    } catch (error) {
      if (error instanceof ProposalAnswered) return null;
      throw error;
    }
  }

  /** Hides a shown köşk deck; false when there is none to hide. */
  async hideDeck(id: string, by: string, level: HideLevel): Promise<boolean> {
    const rows = await this.db
      .update(decks)
      .set({ archivedAt: new Date(), archivedBy: by, archivedLevel: level })
      .where(
        and(eq(decks.id, id), isNotNull(decks.koskId), isNull(decks.archivedAt))
      )
      .returning({ id: decks.id });
    return rows.length > 0;
  }

  // ---- proposals ----

  async listPendingProposals(
    koskId: string,
    limit: number,
    offset: number
  ): Promise<IDeckProposal[]> {
    const rows = await this.db
      .select({
        id: deckProposals.id,
        koskId: deckProposals.koskId,
        title: deckProposals.title,
        description: deckProposals.description,
        cardType: deckProposals.cardType,
        proposerId: deckProposals.proposedBy,
        givenName: users.givenName,
        familyName: users.familyName,
        email: users.email,
        courseTitle: courses.title,
        status: deckProposals.status,
        createdAt: deckProposals.createdAt,
      })
      .from(deckProposals)
      .leftJoin(users, eq(users.id, deckProposals.proposedBy))
      .leftJoin(courses, eq(courses.id, deckProposals.courseId))
      .where(
        and(
          eq(deckProposals.koskId, koskId),
          eq(deckProposals.status, "PENDING")
        )
      )
      .orderBy(asc(deckProposals.createdAt), asc(deckProposals.id))
      .limit(limit)
      .offset(offset);
    return rows.map((r) => ({
      id: r.id,
      koskId: r.koskId,
      title: r.title,
      description: r.description,
      cardType: r.cardType,
      proposedBy: {
        id: r.proposerId,
        name: nameOf(r.givenName, r.familyName, r.email),
      },
      courseTitle: r.courseTitle,
      status: r.status,
      createdAt: r.createdAt,
    }));
  }

  /** Every proposal of the köşk nobody has answered, whatever page is read. */
  async countPendingProposals(koskId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(deckProposals)
      .where(
        and(
          eq(deckProposals.koskId, koskId),
          eq(deckProposals.status, "PENDING")
        )
      );
    return row?.n ?? 0;
  }

  async findProposal(koskId: string, id: string) {
    const [row] = await this.db
      .select({
        id: deckProposals.id,
        title: deckProposals.title,
        proposedBy: deckProposals.proposedBy,
        status: deckProposals.status,
      })
      .from(deckProposals)
      .where(and(eq(deckProposals.id, id), eq(deckProposals.koskId, koskId)))
      .limit(1);
    return row ?? null;
  }

  async rejectProposal(
    id: string,
    by: string,
    reason: string
  ): Promise<boolean> {
    const rows = await this.db
      .update(deckProposals)
      .set({
        status: "REJECTED",
        rejectReason: reason,
        decidedBy: by,
        decidedAt: new Date(),
      })
      .where(and(eq(deckProposals.id, id), eq(deckProposals.status, "PENDING")))
      .returning({ id: deckProposals.id });
    return rows.length > 0;
  }

  async createProposal(input: {
    koskId: string;
    proposedBy: string;
    courseId: string | null;
    title: string;
    description?: string;
    cardType: FlashcardType;
  }): Promise<string> {
    const [row] = await this.db
      .insert(deckProposals)
      .values(input)
      .returning({ id: deckProposals.id });
    return row.id;
  }

  /** The course, when the person holds a müderris seat on it in this köşk. */
  async muderrisCourseInKosk(
    userId: string,
    koskId: string,
    courseId?: string
  ): Promise<string | null> {
    const [row] = await this.db
      .select({ id: courses.id })
      .from(courses)
      .innerJoin(
        roleAssignments,
        and(
          eq(roleAssignments.userId, userId),
          holdsIn(ASSIGNED_ROLES.MUDERRIS, courses.id)
        )
      )
      .where(
        and(
          eq(courses.koskId, koskId),
          isNull(courses.archivedAt),
          courseId ? eq(courses.id, courseId) : undefined
        )
      )
      .limit(1);
    return row?.id ?? null;
  }
}
