import { Injectable } from "@nestjs/common";
import { CardIncludeEnum } from "./domain/card-include.enum";
import { CreateFlashcardDto } from "./dto/create-flashcard.dto";
import { CreateFlashcardProgressDto } from "./dto/create-flashcard-progress.dto";
import { FlashcardRepository } from "./flashcard.repository";
import {
  ICreateFlashcard,
  IFlashcard,
  IFlashcardProgress,
  IUpdateFlashcard,
} from "./flashcard.repository.interface";

const validIncludes = new Set<string>(Object.values(CardIncludeEnum));

function toIncludeSet(include?: string[]): Set<CardIncludeEnum> {
  if (!include) return new Set();
  return new Set(
    include.filter((v): v is CardIncludeEnum => validIncludes.has(v))
  );
}

@Injectable()
export class FlashcardService {
  constructor(private readonly cardRepo: FlashcardRepository) {}

  async findById(
    id: string,
    userId: string,
    include?: string[]
  ): Promise<IFlashcard | null> {
    return this.cardRepo.findById(id, userId, toIncludeSet(include));
  }

  async findByDeckId(
    deckId: string,
    userId: string,
    include?: string[]
  ): Promise<IFlashcard[]> {
    return this.cardRepo.findByDeckId(deckId, userId, toIncludeSet(include));
  }

  async createMany(
    deckId: string,
    authorId: string,
    cards: CreateFlashcardDto[]
  ): Promise<IFlashcard[]> {
    const newCards: ICreateFlashcard[] = cards.map((card) => ({
      ...card,
      deckId,
      authorId,
    }));
    return this.cardRepo.createMany(newCards);
  }

  async replaceManyProgress(
    userId: string,
    progress: CreateFlashcardProgressDto[]
  ): Promise<IFlashcardProgress[]> {
    // `userId` last, not first: it is the authenticated caller's id and must
    // win over anything the request body carries. Nothing can reach this with a
    // `userId` today — CreateFlashcardProgressDto has no such field and
    // MedarisValidationPipe runs forbidNonWhitelisted — but with the spread
    // first, adding one to the DTO would silently let a caller write another
    // user's progress.
    const progressWithUser = progress.map((data) => ({
      ...data,
      userId,
    }));

    return this.cardRepo.replaceManyProgress(progressWithUser);
  }

  async update(
    id: string,
    updates: IUpdateFlashcard
  ): Promise<IFlashcard | null> {
    return this.cardRepo.update(id, updates);
  }

  async delete(id: string): Promise<boolean> {
    return this.cardRepo.delete(id);
  }
}
