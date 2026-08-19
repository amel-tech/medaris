import { ExcelService } from "@medaris/common";
import { plainToClass } from "@nestjs/class-transformer";
import { validate } from "@nestjs/class-validator";
import { Injectable } from "@nestjs/common";
import { FLASHCARD_EXCEL_CONFIG } from "./dto/config-excel.dto";
import { CreateFlashcardDto } from "./dto/create-flashcard.dto";
import {
  BulkFlashcardResponse,
  flattenValidationErrors,
  RowError,
} from "./dto/flashcard-bulk-response.dto";
import { BulkPayloadError } from "./errors/bulk-payload.error";
import { BulkRowLimitExceededError } from "./errors/bulk-row-limit.error";
import { FlashcardService } from "./flashcard.service";

/**
 * Upper bound on the rows a single bulk create or import may carry. Both the
 * JSON and the file path end up in one `INSERT ... VALUES`, which is otherwise
 * as large as the client cares to make it.
 */
export const MAX_BULK_ROWS = 1000;

/**
 * The outcome of a batch that was well-formed enough to validate row by row.
 * It does not enumerate every way `addFlashcards` can fail: a malformed or
 * oversized batch is a fail-fast guard and throws, the way `DeckNotFoundError`
 * does elsewhere in this module.
 */
export type BulkAddResult =
  | { success: true; data: BulkFlashcardResponse }
  | { success: false; error: "VALIDATION_FAILED"; rowErrors: RowError[] };

@Injectable()
export class FlashcardBulkService {
  constructor(
    private readonly cardService: FlashcardService,
    private readonly excelService: ExcelService
  ) {}

  public async addFlashcards(
    deckId: string,
    authorId: string,
    cards: CreateFlashcardDto[]
  ): Promise<BulkAddResult> {
    // Both callers reach this method, so the shape and the size of the batch
    // are settled here rather than at each entry point. Without the array
    // check a non-array body walked straight past `validateCards` — its loop
    // reads `.length`, which is `undefined` on an object — and died in
    // `createMany` as a raw 500.
    if (!Array.isArray(cards) || cards.length === 0) {
      throw new BulkPayloadError();
    }
    if (cards.length > MAX_BULK_ROWS) {
      throw new BulkRowLimitExceededError(cards.length, MAX_BULK_ROWS);
    }

    const [rowErrors, isError] = await this.validateCards(cards);
    if (isError) {
      return { success: false, error: "VALIDATION_FAILED", rowErrors };
    }

    const flashCards = await this.cardService.createMany(
      deckId,
      authorId,
      cards
    );
    return { success: true, data: { count: flashCards.length } };
  }

  public async exportFlashcards(
    deckId: string,
    userId: string,
    title: string,
    format: "xlsx" | "csv" = "xlsx"
  ) {
    const cards = await this.cardService.findByDeckId(deckId, userId);
    const data = cards.map((card) => ({
      type: card.type,
      contentFront: card.contentFront,
      contentBack: card.contentBack,
    }));

    return this.excelService.exportData(
      data,
      FLASHCARD_EXCEL_CONFIG,
      title,
      format
    );
  }

  private async validateCards(
    cards: CreateFlashcardDto[]
  ): Promise<[rowErrors: RowError[], isError: boolean]> {
    const rowErrors: RowError[] = [];
    const items = plainToClass(CreateFlashcardDto, cards);
    let isError = false;

    for (let i = 0; i < items.length; i++) {
      const errors = await validate(items[i], {
        whitelist: true,
        forbidNonWhitelisted: true,
      });

      if (errors.length > 0) {
        rowErrors.push({
          row: i + 2, // +2: 1-based index + header row
          errors: flattenValidationErrors(errors),
        });
        isError = true;
      }
    }

    return [rowErrors, isError];
  }
}
