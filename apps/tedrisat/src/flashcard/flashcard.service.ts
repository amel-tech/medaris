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
    // win over anything the request body carries. This order is the only thing
    // enforcing that. `CreateFlashcardProgressDto` declaring no `userId` means
    // TypeScript never sees one, not that the property is removed: the route
    // binds `@Body(new ParseArrayPipe({ items: CreateFlashcardProgressDto }))`
    // (flashcard.controller.ts:152), which builds its own ValidationPipe from
    // those options alone and so inherits neither `whitelist` nor
    // `forbidNonWhitelisted`, while the global MedarisValidationPipe skips the
    // parameter outright — its metatype is the native `Array`. Measured: an
    // extra `userId` in a body element is neither stripped nor rejected and
    // arrives in `data`.
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
