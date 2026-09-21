import {
  AuthGuard,
  Authz,
  AuthzExempt,
  AuthzGuard,
  byParam,
  byQuery,
  ENTITIES,
  ExcelService,
  SCOPES,
} from "@medaris/common";
import {
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  HttpException,
  HttpStatus,
  MaxFileSizeValidator,
  Param,
  ParseArrayPipe,
  ParseFilePipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnprocessableEntityResponse,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { BULK_THROTTLE } from "../config/throttle-env";
import { byParentDeckOfCard } from "./authz/deck-of-card.resolver";
import {
  IncludeApiQuery,
  IncludeQuery,
} from "./decorators/include-query.decorator";
import { CardIncludeEnum } from "./domain/card-include.enum";
import {
  FLASHCARD_EXCEL_CONFIG,
  FlashcardColumnDto,
} from "./dto/config-excel.dto";
import { CreateFlashcardDto } from "./dto/create-flashcard.dto";
import { CreateFlashcardProgressDto } from "./dto/create-flashcard-progress.dto";
import {
  BulkFlashcardErrorResponse,
  BulkFlashcardResponse,
} from "./dto/flashcard-bulk-response.dto";
import { FlashcardProgressResponse } from "./dto/flashcard-progress-response.dto";
import { FlashcardResponse } from "./dto/flashcard-response.dto";
import { UpdateFlashcardDto } from "./dto/update-flashcard.dto";
import { BulkValidationError } from "./errors/bulk-validation.error";
import { FlashcardService } from "./flashcard.service";
import { FlashcardBulkService } from "./flashcard-bulk.service";
import { FlashcardDeckService } from "./flashcard-deck.service";
import { AuthorizedRequest } from "./interfaces/authorized-request.interface";

@ApiTags("flashcard-cards")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller("flashcard/")
export class FlashcardController {
  constructor(
    private readonly cardService: FlashcardService,
    private readonly cardBulkService: FlashcardBulkService,
    private readonly deckService: FlashcardDeckService,
    private readonly excelService: ExcelService
  ) {}

  // GET Requests

  @ApiOperation({
    summary: "Get a single flashcard",
    description: "Retrieves a specific flashcard by its unique identifier",
    operationId: "getFlashcardById",
  })
  @ApiOkResponse({ type: FlashcardResponse })
  @ApiNotFoundResponse()
  @ApiForbiddenResponse({
    description: "Deck is private and owned by another user",
  })
  @IncludeApiQuery(CardIncludeEnum)
  @Authz(SCOPES.VIEW, byParentDeckOfCard())
  @Get("cards/:id")
  async findById(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) cardId: string,
    @IncludeQuery() include?: string[]
  ): Promise<FlashcardResponse> {
    const userId = request.user.sub;
    // `FlashcardRepository.findById` filters on `flashcards.id` alone, so the
    // card's own row proves nothing about who may see it — the deck is the
    // only thing carrying a visibility rule. `byParentDeckOfCard` above walks
    // `flashcards.deckId` and hands the guard the deck, so by the time this
    // handler runs the access question is already settled and the only thing
    // left is whether the card row itself exists.
    const card = await this.cardService.findById(cardId, userId, include);
    if (!card) {
      throw new HttpException(
        `could not find card #${cardId}`,
        HttpStatus.NOT_FOUND
      );
    }
    return card;
  }

  @ApiOperation({
    summary: "Get all flashcards from a deck",
    description: "Retrieves all flashcards by matching a deck identifier",
    operationId: "getFlashcardByDeckId",
  })
  @ApiOkResponse({ type: [FlashcardResponse] })
  @ApiNotFoundResponse({ description: "Deck not found" })
  @ApiForbiddenResponse({
    description: "Deck is private and owned by another user",
  })
  @ApiQuery({ name: "deckId", required: true, type: String })
  @IncludeApiQuery(CardIncludeEnum)
  @Authz(SCOPES.VIEW, byQuery(ENTITIES.FLASHCARD_DECK, "deckId"))
  @Get("cards")
  async findByDeckId(
    @Req() request: AuthorizedRequest,
    @Query("deckId", ParseUUIDPipe) deckId: string,
    @IncludeQuery() include?: string[]
  ): Promise<FlashcardResponse[]> {
    const userId = request.user.sub;
    // The `userId` threaded into `findByDeckId` is NOT a scoping argument —
    // it only narrows the optional `progress` relation, and the rows come
    // back filtered on `deckId` alone either way. The guard is what scopes
    // this route, off the `deckId` QUERY param rather than a route param;
    // `VIEW` and not an owner scope, because a public deck is browsable.
    return this.cardService.findByDeckId(deckId, userId, include);
  }

  // POST Requests

  @ApiOperation({
    summary: "Create multiple flashcards in a deck",
    description:
      "Creates multiple flashcards within a specified deck. All cards will be assigned to the same deck and author.",
    operationId: "createFlashcards",
  })
  @ApiBody({ type: [CreateFlashcardDto] })
  @ApiCreatedResponse({ type: FlashcardResponse, isArray: true })
  @ApiNotFoundResponse({ description: "Deck not found" })
  @ApiForbiddenResponse({ description: "Deck belongs to another user" })
  @Authz(SCOPES.CREATE_FLASHCARD, byParam(ENTITIES.FLASHCARD_DECK, "deckId"))
  @Post("decks/:deckId/cards")
  async createMany(
    @Req() request: AuthorizedRequest,
    @Param("deckId", ParseUUIDPipe) deckId: string,
    @Body(new ParseArrayPipe({ items: CreateFlashcardDto }))
    cardsDto: CreateFlashcardDto[]
  ): Promise<FlashcardResponse[]> {
    // The MDRS-63 `assertOwner` stopgap is now the `@Authz` above — this is
    // the replacement that comment promised. `CREATE_FLASHCARD` rather than a
    // manage scope: on today's reachable matrix only DECK_OWNER carries it,
    // so behaviour is unchanged, but the kosk/medrese/course deck variants
    // land on this same row when their resolver dispatch does.
    const authorId = request.user.sub;
    return this.cardService.createMany(deckId, authorId, cardsDto);
  }

  // PUT Requests

  @ApiOperation({
    summary: "Create or update flashcard progress",
    operationId: "replaceManyFlashcardProgress",
  })
  @ApiOkResponse({ type: [FlashcardProgressResponse] })
  @ApiBody({ type: [CreateFlashcardProgressDto] })
  @ApiNotFoundResponse({ description: "No such card" })
  @ApiForbiddenResponse({
    description: "A card's deck is private and owned by another user",
  })
  // Exempt: `@Authz` names ONE resource and this route's body names N cards
  // in any number of decks, so the check cannot be expressed as a decorator
  // without authorizing only the first id. The equivalent lives one layer
  // down, in `FlashcardService.replaceManyProgress`, which resolves every
  // id's deck in a single query and separates "no such card" (404) from
  // "deck you cannot reach" (403).
  @AuthzExempt()
  @Put("cards/progress")
  async replaceManyProgress(
    @Req() request: AuthorizedRequest,
    @Body(new ParseArrayPipe({ items: CreateFlashcardProgressDto }))
    progressDto: CreateFlashcardProgressDto[]
  ): Promise<FlashcardProgressResponse[]> {
    // The whole `AuthenticatedUser`, not just `sub`: the check inside needs
    // `realm_access` for the SYSTEM_ADMIN bypass that `AuthzService.can`
    // applies on every decorated route, and this route has no decorator.
    //
    // The MDRS-63 stopgap that stood here — `deckOf` then `assertReadable`,
    // two queries per distinct card — is now one batched query in the service,
    // which is also the only layer that can separate "no such card" from
    // "deck you cannot reach" for a list of ids.
    return this.cardService.replaceManyProgress(request.user, progressDto);
  }

  @ApiOperation({
    summary: "Replace a flashcard completely",
    description:
      "Replaces all properties of an existing flashcard with new values. This is a complete replacement operation.",
    operationId: "replaceFlashcard",
  })
  @ApiBody({ type: CreateFlashcardDto })
  @ApiOkResponse({ type: FlashcardResponse })
  @ApiNotFoundResponse()
  @ApiForbiddenResponse({ description: "Deck belongs to another user" })
  @Authz(SCOPES.MANAGE_FLASHCARDS, byParentDeckOfCard())
  @Put("cards/:id")
  async replace(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) cardId: string,
    @Body() cardDto: CreateFlashcardDto
  ): Promise<FlashcardResponse> {
    // `MANAGE_FLASHCARDS` on the parent deck — the guard walks `deckId` for
    // us, so the `deckOf` + `assertOwner` pair this used to open with is gone.
    const updatedCard = await this.cardService.update(cardId, cardDto);
    if (!updatedCard) {
      throw new HttpException(
        `could not find card #${cardId}`,
        HttpStatus.NOT_FOUND
      );
    }
    return updatedCard;
  }

  // PATCH Requests
  @ApiOperation({
    summary: "Update a flashcard partially",
    description:
      "Updates specific properties of an existing flashcard. Only provided fields will be updated.",
    operationId: "updateFlashcard",
  })
  @ApiBody({ type: UpdateFlashcardDto })
  @ApiOkResponse({ type: FlashcardResponse })
  @ApiNotFoundResponse()
  @ApiForbiddenResponse({ description: "Deck belongs to another user" })
  @Authz(SCOPES.MANAGE_FLASHCARDS, byParentDeckOfCard())
  @Patch("cards/:id")
  async update(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) cardId: string,
    @Body() cardDto: UpdateFlashcardDto
  ): Promise<FlashcardResponse> {
    const updatedCard = await this.cardService.update(cardId, cardDto);
    if (!updatedCard) {
      throw new HttpException(
        `could not find card #${cardId}`,
        HttpStatus.NOT_FOUND
      );
    }
    return updatedCard;
  }

  // DELETE Requests

  @ApiOperation({
    summary: "Delete a flashcard",
    description:
      "Permanently deletes a flashcard by its ID. This action cannot be undone.",
    operationId: "deleteFlashcard",
  })
  @ApiOkResponse()
  @ApiNotFoundResponse()
  @ApiForbiddenResponse({ description: "Deck belongs to another user" })
  @Authz(SCOPES.MANAGE_FLASHCARDS, byParentDeckOfCard())
  @Delete("cards/:id")
  async deleteCard(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) cardId: string
  ): Promise<boolean> {
    return this.cardService.delete(cardId);
  }

  // The three bulk routes below carry a budget an order of magnitude lower than
  // every other endpoint: one workbook can be 5MB and is parsed row by row, and
  // an export streams a whole deck. `default` names the single throttler
  // registered in RateLimitModule — this overrides its limit for this handler
  // only, it does not add a second one. See ../config/throttle-env.ts.
  // Post Bulk
  @ApiOperation({
    summary: "Bulk",
    description: "Bulk Body Json",
    operationId: "createFlashcardsBulk",
  })
  @ApiBody({ type: [CreateFlashcardDto] })
  @ApiCreatedResponse({ type: BulkFlashcardResponse })
  @ApiUnprocessableEntityResponse({ type: BulkFlashcardErrorResponse })
  @ApiNotFoundResponse({ description: "Deck not found" })
  @ApiForbiddenResponse({ description: "Deck belongs to another user" })
  @ApiTooManyRequestsResponse({
    description: "Bulk rate limit exceeded — see the Retry-After header",
  })
  @Throttle({ default: BULK_THROTTLE })
  @Authz(SCOPES.CREATE_FLASHCARD, byParam(ENTITIES.FLASHCARD_DECK, "deckId"))
  @Post("decks/:deckId/cards/bulk")
  async bulk(
    @Req() request: AuthorizedRequest,
    @Param("deckId", ParseUUIDPipe) deckId: string,
    // The global pipe skips array metatypes, so a bare `@Body()` here checked
    // nothing at all — not even that the body was a list.
    //
    // Deliberately WITHOUT `items:`, unlike the sibling endpoint above. The
    // array check is unconditional in ParseArrayPipe; `items` only adds
    // per-element DTO validation, which this endpoint already does better
    // downstream — `FlashcardBulkService.validateCards` runs with
    // `whitelist`/`forbidNonWhitelisted` and aggregates EVERY bad row into the
    // 422 `RowError[]` body. The pipe's own validation would pre-empt that
    // with a 400 carrying only the first bad row.
    @Body(new ParseArrayPipe())
    cardsDto: CreateFlashcardDto[]
  ): Promise<BulkFlashcardResponse> {
    // `findById` proved the deck exists and nothing more, so any valid token
    // could write MAX_BULK_ROWS cards into a deck it merely knew the id of.
    // The MDRS-63 `assertOwner` stopgap that closed it is now the `@Authz`
    // above, same as the JSON sibling.
    const result = await this.cardBulkService.addFlashcards(
      deckId,
      request.user.sub,
      cardsDto
    );
    if (!result.success) throw new BulkValidationError(result.rowErrors);

    return result.data;
  }

  // Get Bulk Sample File
  // Exempt: the one route in this controller that reads no user data at all.
  // `generateSample` builds an empty workbook from a static column config, so
  // there is no resource to name and nothing a scope could protect.
  @AuthzExempt()
  @Get("cards/bulk/sample")
  @ApiOperation({
    summary: "Download flashcard import template",
    description:
      "Downloads a sample file to use as a template for bulk import. Not deck-specific.",
    operationId: "getSampleFile",
  })
  @ApiOkResponse({ type: StreamableFile })
  @ApiQuery({
    name: "format",
    required: true,
    type: String,
    enum: ["xlsx", "csv"],
    description: "The format of the file to download",
  })
  async downloadSample(@Query("format") format: "xlsx" | "csv" = "xlsx") {
    return this.excelService.generateSample(FLASHCARD_EXCEL_CONFIG, format);
  }

  // Get Export File
  @Throttle({ default: BULK_THROTTLE })
  @Authz(SCOPES.MANAGE_FLASHCARDS, byParam(ENTITIES.FLASHCARD_DECK, "deckId"))
  @Get("decks/:deckId/cards/bulk/export")
  @ApiOperation({
    summary: "Export flashcards from a deck",
    operationId: "exportCards",
  })
  @ApiOkResponse({ type: StreamableFile })
  @ApiNotFoundResponse({ description: "Deck not found" })
  @ApiForbiddenResponse({ description: "Deck belongs to another user" })
  @ApiTooManyRequestsResponse({
    description: "Bulk rate limit exceeded — see the Retry-After header",
  })
  @ApiQuery({
    name: "format",
    required: false,
    type: String,
    enum: ["xlsx", "csv"],
    description: "The format of the file to download",
  })
  async exportCards(
    @Param("deckId", ParseUUIDPipe) deckId: string,
    @Req() request: AuthorizedRequest,
    @Query("format") format: "xlsx" | "csv" = "xlsx"
  ) {
    // `exportFlashcards` threads a `userId` down to `findByDeckId`, which
    // looks like a scoping argument and is not one: it passes no `include`,
    // so `buildWith` returns `{}` and the id is never read at all. Even with
    // an `include` it would only scope the progress relation — the rows come
    // back filtered on `deckId` alone either way.
    //
    // `MANAGE_FLASHCARDS`, not `VIEW`: a whole-deck export is an owner
    // affordance, and widening it to every public-deck reader would be a
    // behaviour change this task has no mandate for. `findOwned` stays for the
    // `title` the filename needs — the guard has already settled access, so it
    // is the read, not the assertion, that is load-bearing now.
    const deck = await this.deckService.findOwned(deckId, request.user.sub);

    return this.cardBulkService.exportFlashcards(
      deckId,
      request.user.sub,
      deck.title,
      format
    );
  }

  // Post Import File
  @Throttle({ default: BULK_THROTTLE })
  @Authz(SCOPES.CREATE_FLASHCARD, byParam(ENTITIES.FLASHCARD_DECK, "deckId"))
  @Post("decks/:deckId/cards/bulk/import")
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({
    summary: "Import flashcards from Excel/CSV",
    operationId: "importsCard",
  })
  @ApiCreatedResponse({ type: BulkFlashcardResponse })
  @ApiNotFoundResponse({ description: "Deck not found" })
  @ApiForbiddenResponse({ description: "Deck belongs to another user" })
  @ApiUnprocessableEntityResponse({ type: BulkFlashcardErrorResponse })
  @ApiTooManyRequestsResponse({
    description: "Bulk rate limit exceeded — see the Retry-After header",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          format: "binary",
        },
      },
      required: ["file"],
    },
  })
  async importCards(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({
            fileType:
              /^(application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|text\/csv|text\/plain|application\/octet-stream|application\/vnd\.ms-excel)$/,
            skipMagicNumbersValidation: true,
          }),
        ],
      })
    )
    file: Express.Multer.File,
    @Param("deckId", ParseUUIDPipe) deckId: string,
    @Req() request: AuthorizedRequest
  ) {
    // Same hole as `bulk`, reached through a file instead of a JSON body, and
    // closed by the same `@Authz` above. The guard runs BEFORE the interceptor
    // buffers the upload, which is strictly better than the `assertOwner` this
    // replaces: that one refused after ParseFilePipe had already accepted 5MB.
    const format = this.excelService.detectFormat(
      file.mimetype,
      file.originalname
    );

    const cards = await this.excelService.parseFile<FlashcardColumnDto>(
      file.buffer,
      FLASHCARD_EXCEL_CONFIG,
      format
    );

    if (cards == null || cards.length === 0)
      throw new HttpException(
        "The uploaded file contains no data rows. Please ensure the file has a header row and at least one data row.",
        HttpStatus.BAD_REQUEST
      );
    const result = await this.cardBulkService.addFlashcards(
      deckId,
      request.user.sub,
      [...cards]
    );
    if (!result.success) throw new BulkValidationError(result.rowErrors);

    return result.data;
  }
}
