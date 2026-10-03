import {
  AuthGuard,
  Authz,
  AuthzExempt,
  AuthzGuard,
  AuthzPublic,
  byParam,
  ENTITIES,
  forNew,
  PERMISSIONS,
} from "@medaris/common";
import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseEnumPipe,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import {
  IncludeApiQuery,
  IncludeQuery,
} from "./decorators/include-query.decorator";
import { FlashcardType } from "./domain/flashcard-type.enum";
import { CreateFlashcardDeckDto } from "./dto/create-flashcard-deck.dto";
import { FlashcardDeckResponse } from "./dto/flashcard-deck-response.dto";
import {
  FlashcardDeckExploreResponse,
  FlashcardDeckSummaryResponse,
} from "./dto/flashcard-deck-summary-response.dto";
import { FlashcardDeckUserResponse } from "./dto/flashcard-deck-user-response.dto";
import { UpdateFlashcardDeckDto } from "./dto/update-flashcard-deck.dto";
import { FlashcardDeckService } from "./flashcard-deck.service";
import { FlashcardDeckSummaryService } from "./flashcard-deck-summary.service";
import { AuthorizedRequest } from "./interfaces/authorized-request.interface";
import { PublicRequest } from "./interfaces/public-request.interface";

export enum DeckIncludeEnum {}
// Tags = 'tags',

@ApiTags("flashcard-decks")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller("flashcard/decks")
export class FlashcardDeckController {
  constructor(
    private readonly deckService: FlashcardDeckService,
    private readonly summaryService: FlashcardDeckSummaryService
  ) {}

  // GET Requests

  @ApiOperation({
    summary: "Get all flashcard decks in the user's collection",
    operationId: "getAllFlashcardDecksByUser",
  })
  @ApiOkResponse({ type: FlashcardDeckResponse, isArray: true })
  // Exempt: no resource in the request to authorize against — the rows are
  // selected by the caller's own `sub`. The scoping therefore has to live in
  // the query, and `findAllByUser` carries an `(isPublic OR authorId)`
  // predicate so a deck that was collected while public, then made private,
  // drops out of the list instead of leaking on through the join.
  @AuthzExempt()
  @Get("/collections")
  async findAllUserCollections(
    @Req() request: AuthorizedRequest
  ): Promise<FlashcardDeckResponse[]> {
    const userId = request.user.sub;
    return this.deckService.findAllByUser(userId);
  }

  @ApiOperation({
    summary: "Get the caller's decks with their progress",
    description:
      "The caller's own decks followed by the decks of other people they collected, each with the card counts and the caller's progress through them, so a list page makes one request instead of one per deck.",
    operationId: "getFlashcardDeckSummaries",
  })
  @ApiOkResponse({ type: FlashcardDeckSummaryResponse, isArray: true })
  // Exempt for the reason `/collections` is: the rows are chosen by the
  // caller's own `sub`, in the query, and no resource is named in the request.
  // Declared before `:id` so `summary` is not read as a deck id.
  @AuthzExempt()
  @Get("summary")
  async summary(
    @Req() request: AuthorizedRequest
  ): Promise<FlashcardDeckSummaryResponse[]> {
    return this.summaryService.summarize(request.user.sub);
  }

  @ApiOperation({
    summary: "The decks to study today",
    description:
      "The decks of the caller's collection with something to study (MDRS-165): first the ones with cards waiting for a repeat, most first, then the decks of other people that grew since the caller collected them.",
    operationId: "getFlashcardDecksDueToday",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: "At most this many decks; 3 by default, 10 at most.",
  })
  @ApiOkResponse({ type: FlashcardDeckSummaryResponse, isArray: true })
  // Exempt for the reason `summary` is. Declared before `:id`.
  @AuthzExempt()
  @Get("due")
  async dueToday(
    @Req() request: AuthorizedRequest,
    @Query("limit", new DefaultValuePipe(3), ParseIntPipe) limit: number
  ): Promise<FlashcardDeckSummaryResponse[]> {
    return this.summaryService.dueToday(
      request.user.sub,
      Math.min(Math.max(limit, 1), 10)
    );
  }

  @ApiOperation({
    summary: "Discover decks to collect",
    description:
      "The decks of the courses, köşks and medreses the caller is enrolled in, and the decks Medaris published, each marked with whether the caller has it in the collection.",
    operationId: "exploreFlashcardDecks",
  })
  @ApiQuery({
    name: "cardType",
    required: false,
    enum: FlashcardType,
    description: "Leaves out decks of the other kind.",
  })
  @ApiOkResponse({ type: FlashcardDeckExploreResponse })
  // Exempt, as `summary` above: visibility is the query's predicate.
  @AuthzExempt()
  @Get("explore")
  async explore(
    @Req() request: AuthorizedRequest,
    @Query("cardType", new ParseEnumPipe(FlashcardType, { optional: true }))
    cardType?: FlashcardType
  ): Promise<FlashcardDeckExploreResponse> {
    return this.summaryService.explore(request.user.sub, cardType);
  }

  @ApiOperation({
    summary: "Get flashcard deck by ID",
    description:
      "Retrieves a single flashcard deck by its ID with optional includes for related data such as tags.",
    operationId: "getFlashcardDeckById",
  })
  @ApiOkResponse({ type: FlashcardDeckResponse })
  @ApiNotFoundResponse({
    description:
      "No such deck, or a private deck owned by another user — deliberately the same answer",
  })
  @IncludeApiQuery(DeckIncludeEnum)
  @Authz(PERMISSIONS.DECK_VIEW, byParam(ENTITIES.FLASHCARD_DECK))
  // MDRS-45: a public deck is readable with no token (PRD:76). An anonymous
  // caller is decided by `resolveAnonymous` — ANONYMOUS for a public deck,
  // the same 404 as a missing deck for a private one — and a token that is
  // present but invalid is still a 401 from `AuthGuard`.
  @AuthzPublic()
  @Get(":id")
  async findById(
    @Req() request: PublicRequest,
    @Param("id", ParseUUIDPipe) deckId: string,
    @IncludeQuery() include?: string[]
  ): Promise<FlashcardDeckResponse> {
    // `@Authz(deck.view)` above is what decides: `resolveDeckRole` answers
    // DECK_OWNER for the author and PUBLIC for a public deck, and raises the
    // same `DeckNotFoundError` for a missing deck and for somebody else's
    // private one (MDRS-43 AC-4). `findReadable` still re-reads the rule
    // rather than `findById`, so the handler does not depend on the guard
    // having run.
    return this.deckService.findReadable(
      deckId,
      request.user?.sub ?? null,
      include
    );
  }

  @ApiOperation({
    summary: "Get all flashcard decks visible to the user",
    description:
      "Retrieves all flashcard decks that are either public or owned by the user, with optional includes for related data such as tags.",
    operationId: "getAllFlashcardDecks",
  })
  @ApiOkResponse({ type: FlashcardDeckResponse, isArray: true })
  @ApiQuery({
    name: "isPublic",
    required: false,
    type: Boolean,
    description:
      "When omitted returns public decks and user-owned private decks. When true returns only public decks. When false returns only user-owned private decks.",
  })
  // No `@Authz`: a list route has no single resource to authorize.
  // Visibility is enforced inside the query — `findAllVisibleToUser` returns
  // public decks plus the caller's own — which is the only place it can be
  // for a list. `@AuthzPublic()` (MDRS-45) opens it to a caller with no
  // token, who has no decks of their own and so sees the public ones only.
  @AuthzPublic()
  @Get()
  @IncludeApiQuery(DeckIncludeEnum)
  async findAll(
    @Req() request: PublicRequest,
    @Query("isPublic", new ParseBoolPipe({ optional: true }))
    isPublic?: boolean,
    @IncludeQuery() include?: string[]
  ): Promise<FlashcardDeckResponse[]> {
    const userId = request.user?.sub;
    if (userId === undefined) {
      // `isPublic=false` asks for the caller's own private decks, and an
      // anonymous caller owns none. Answered here rather than by passing a
      // null author into the query, where "matches nobody" would rest on how
      // SQL compares NULL.
      return isPublic === false ? [] : this.deckService.findAll(include);
    }
    const filters = isPublic !== undefined ? { isPublic } : undefined;
    return this.deckService.findAllVisibleToUser(userId, filters, include);
  }

  // POST Requests

  @ApiOperation({
    summary: "Create a new flashcard deck",
    description:
      "Creates a new flashcard deck with the provided details. Tags can be optionally associated with the deck.",
    operationId: "createFlashcardDeck",
  })
  @ApiCreatedResponse({ type: FlashcardDeckResponse })
  // No resource yet, so the question is "may this caller create a deck at
  // all" — `CREATE_PRIVATE_DECK` sits on the FLASHCARD_DECK PUBLIC row, so
  // every authenticated caller may. `isPublic` on the body stays legal here
  // and only here: visibility is the author's decision at creation time.
  @Authz(PERMISSIONS.DECK_CREATE_PRIVATE, forNew(ENTITIES.FLASHCARD_DECK))
  @Post()
  async create(
    @Req() request: AuthorizedRequest,
    @Body() deckDto: CreateFlashcardDeckDto
  ): Promise<FlashcardDeckResponse> {
    const userId = request.user.sub;
    const newDeck = { authorId: userId, ...deckDto };
    const createdDeck = await this.deckService.create(newDeck);

    return createdDeck;
  }

  @ApiOperation({
    summary: "Add a deck to the user's collection",
    description:
      "Creates a new association between a flashcard deck and the authenticated user.",
    operationId: "createFlashcardDeckUser",
  })
  @ApiCreatedResponse({ type: FlashcardDeckUserResponse })
  @ApiNotFoundResponse({ description: "Deck not found" })
  @ApiForbiddenResponse({
    description: "Deck is private and owned by another user",
  })
  // Hole #1 in the MDRS-43 brief: a deck you may not read is a deck you may
  // not collect. `VIEW` is the right scope rather than an owner scope —
  // collecting somebody else's PUBLIC deck is what this route is for.
  @Authz(PERMISSIONS.DECK_VIEW, byParam(ENTITIES.FLASHCARD_DECK))
  @Post(":id/collections")
  async addToUserCollection(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) deckId: string
  ): Promise<FlashcardDeckUserResponse> {
    const userId = request.user.sub;
    // The MDRS-63 `assertReadable` stopgap that used to stand here is now the
    // `@Authz(deck.view)` above — same rule, declared instead of called. The second
    // half of the fix is in `findAllByUser`'s predicate: this door was only
    // ever half the hole, because the sibling GET /collections route read the
    // `decksUsers` join with no visibility filter of its own.
    return this.deckService.addToUserCollection(userId, deckId);
  }

  @ApiOperation({
    summary: "Ask for a deck to be published",
    description:
      "Marks a private deck as waiting for Medaris to review it. The deck stays private until it is published.",
    operationId: "requestFlashcardDeckPublication",
  })
  @ApiCreatedResponse({ type: FlashcardDeckResponse })
  @ApiNotFoundResponse({ description: "Deck not found" })
  @ApiForbiddenResponse({ description: "Deck belongs to another user" })
  @ApiConflictResponse({
    description: "The deck already waits for review or is already public",
  })
  // The author's call, like every write on the deck: the scope that edits it.
  @Authz(PERMISSIONS.DECK_MANAGE_PRIVATE, byParam(ENTITIES.FLASHCARD_DECK))
  @Post(":id/publish-request")
  async requestPublication(
    @Param("id", ParseUUIDPipe) deckId: string
  ): Promise<FlashcardDeckResponse> {
    return this.deckService.requestPublish(deckId);
  }

  // PUT Requests

  @ApiOperation({
    summary: "Replace a flashcard deck completely",
    description:
      "Replaces all properties of an existing flashcard deck with new values. This is a complete replacement operation.",
    operationId: "replaceFlashcardDeck",
  })
  @ApiBody({ type: CreateFlashcardDeckDto })
  // @ApiCreatedResponse({ type: FlashcardDeckResponse })
  @ApiOkResponse({ type: FlashcardDeckResponse, isArray: true })
  @ApiNotFoundResponse({ description: "Deck not found" })
  @ApiForbiddenResponse({ description: "Deck belongs to another user" })
  @Authz(PERMISSIONS.DECK_MANAGE_PRIVATE, byParam(ENTITIES.FLASHCARD_DECK))
  @Put(":id")
  async replace(
    @Param("id", ParseUUIDPipe) deckId: string,
    @Body() deckDto: CreateFlashcardDeckDto
  ): Promise<FlashcardDeckResponse> {
    // `deck.manage_private` is held by DECK_OWNER and no other, so the
    // guard above is the `assertOwner` this used to call. That matters beyond
    // this handler: `resolveDeckRole` checks `authorId` before `isPublic`, and
    // its soundness rests on nobody but the author being able to flip the
    // flag — the guard is now what holds that invariant up.
    const updatedDeck = await this.deckService.update(deckId, deckDto);
    if (!updatedDeck) {
      throw new HttpException(
        `deck #${deckId} was not found`,
        HttpStatus.NOT_FOUND
      );
    }
    return updatedDeck;
  }

  // PATCH Requests

  @ApiOperation({
    summary: "Update a flashcard deck partially",
    description:
      "Updates specific properties of an existing flashcard deck. Only provided fields will be updated.",
    operationId: "updateFlashcardDeck",
  })
  @ApiBody({ type: UpdateFlashcardDeckDto })
  @ApiOkResponse({ type: FlashcardDeckResponse })
  @ApiNotFoundResponse({ description: "Deck not found" })
  @ApiForbiddenResponse({ description: "Deck belongs to another user" })
  @Authz(PERMISSIONS.DECK_MANAGE_PRIVATE, byParam(ENTITIES.FLASHCARD_DECK))
  @Patch(":id")
  async updateDeck(
    @Param("id", ParseUUIDPipe) deckId: string,
    @Body() deckDto: UpdateFlashcardDeckDto
  ): Promise<FlashcardDeckResponse> {
    // Same scope as `replace` above, for the same reason.
    const updatedDeck = await this.deckService.update(deckId, deckDto);
    if (!updatedDeck) {
      throw new HttpException(
        `deck #${deckId} was not found`,
        HttpStatus.NOT_FOUND
      );
    }
    return updatedDeck;
  }

  // DELETE Requests

  @ApiOperation({
    summary: "Delete a flashcard deck",
    description:
      "Permanently deletes a flashcard deck by its ID. This action cannot be undone and will also remove all associated flashcards.",
    operationId: "deleteFlashcardDeck",
  })
  @ApiOkResponse()
  @ApiNotFoundResponse({ description: "Deck not found" })
  @ApiForbiddenResponse({ description: "Deck belongs to another user" })
  @Authz(PERMISSIONS.DECK_MANAGE_PRIVATE, byParam(ENTITIES.FLASHCARD_DECK))
  @Delete(":id")
  async delete(@Param("id", ParseUUIDPipe) deckId: string): Promise<boolean> {
    // MDRS-83 added the delete affordance to tedris behind a client-side
    // `isOwner` flag, and a Server Action is an HTTP endpoint like any other:
    // the flag is display-only. `decks.delete` filters on `decks.id` alone
    // and the cards FK cascades, so the guard above is what keeps one user's
    // deck — and its cards — out of another user's reach.
    return this.deckService.delete(deckId);
  }

  @ApiOperation({
    summary: "Withdraw a publication request, or take a public deck back",
    description:
      "Cancels the request for review, or turns a published deck private again.",
    operationId: "withdrawFlashcardDeckPublication",
  })
  @ApiOkResponse({ type: FlashcardDeckResponse })
  @ApiNotFoundResponse({ description: "Deck not found" })
  @ApiForbiddenResponse({ description: "Deck belongs to another user" })
  @ApiConflictResponse({ description: "The deck is private already" })
  @Authz(PERMISSIONS.DECK_MANAGE_PRIVATE, byParam(ENTITIES.FLASHCARD_DECK))
  @Delete(":id/publish-request")
  async withdrawPublication(
    @Param("id", ParseUUIDPipe) deckId: string
  ): Promise<FlashcardDeckResponse> {
    return this.deckService.withdrawPublish(deckId);
  }

  @ApiOperation({
    summary: "Delete a flashcard deck from user's collection",
    operationId: "deleteFlashcardDeckUser",
  })
  @ApiOkResponse({ type: FlashcardDeckUserResponse })
  // Exempt, unlike its POST sibling: this deletes the caller's own
  // `decksUsers` row, and leaving must never depend on still being allowed
  // to read the deck. Requiring VIEW here would strand a collected deck in
  // the list of anyone whose access was revoked after they collected it —
  // the author flipping it back to private is exactly that case.
  @AuthzExempt()
  @Delete(":id/collections")
  async removeFromUserCollection(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) deckId: string
  ): Promise<FlashcardDeckUserResponse> {
    const userId = request.user.sub;
    return this.deckService.removeFromUserCollection(userId, deckId);
  }
}
