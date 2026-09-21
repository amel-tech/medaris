import {
  AuthGuard,
  Authz,
  AuthzExempt,
  AuthzGuard,
  byParam,
  ENTITIES,
  forNew,
  SCOPES,
} from "@medaris/common";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  ParseBoolPipe,
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
import { CreateFlashcardDeckDto } from "./dto/create-flashcard-deck.dto";
import { FlashcardDeckResponse } from "./dto/flashcard-deck-response.dto";
import { FlashcardDeckUserResponse } from "./dto/flashcard-deck-user-response.dto";
import { UpdateFlashcardDeckDto } from "./dto/update-flashcard-deck.dto";
import { FlashcardDeckService } from "./flashcard-deck.service";
import { AuthorizedRequest } from "./interfaces/authorized-request.interface";

export enum DeckIncludeEnum {}
// Tags = 'tags',

@ApiTags("flashcard-decks")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller("flashcard/decks")
export class FlashcardDeckController {
  constructor(private readonly deckService: FlashcardDeckService) {}

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
    summary: "Get flashcard deck by ID",
    description:
      "Retrieves a single flashcard deck by its ID with optional includes for related data such as tags.",
    operationId: "getFlashcardDeckById",
  })
  @ApiOkResponse({ type: FlashcardDeckResponse })
  @ApiNotFoundResponse()
  @ApiForbiddenResponse({
    description: "Deck is private and owned by another user",
  })
  @IncludeApiQuery(DeckIncludeEnum)
  @Authz(SCOPES.VIEW, byParam(ENTITIES.FLASHCARD_DECK))
  @Get(":id")
  async findById(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) deckId: string,
    @IncludeQuery() include?: string[]
  ): Promise<FlashcardDeckResponse> {
    // `@Authz(VIEW)` above is what decides: `resolveDeckRole` answers
    // DECK_OWNER for the author, PUBLIC for a public deck and `null` — a hard
    // deny — for somebody else's private one. `findReadable` still re-reads
    // the rule rather than `findById`, because it is the one call that both
    // fetches the row and 404s a deck that does not exist; the resolver
    // deliberately answers PUBLIC for a missing id instead of leaking
    // existence through the guard's status code.
    return this.deckService.findReadable(deckId, request.user.sub, include);
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
  // Exempt: a list route has no single resource to authorize. Visibility is
  // enforced inside the query — `findAllVisibleToUser` returns public decks
  // plus the caller's own — which is the only place it can be for a list.
  @AuthzExempt()
  @Get()
  @IncludeApiQuery(DeckIncludeEnum)
  async findAll(
    @Req() request: AuthorizedRequest,
    @Query("isPublic", new ParseBoolPipe({ optional: true }))
    isPublic?: boolean,
    @IncludeQuery() include?: string[]
  ): Promise<FlashcardDeckResponse[]> {
    const userId = request.user.sub;
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
  @Authz(SCOPES.CREATE_PRIVATE_DECK, forNew(ENTITIES.FLASHCARD_DECK))
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
  @Authz(SCOPES.VIEW, byParam(ENTITIES.FLASHCARD_DECK))
  @Post(":id/collections")
  async addToUserCollection(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) deckId: string
  ): Promise<FlashcardDeckUserResponse> {
    const userId = request.user.sub;
    // The MDRS-63 `assertReadable` stopgap that used to stand here is now the
    // `@Authz(VIEW)` above — same rule, declared instead of called. The second
    // half of the fix is in `findAllByUser`'s predicate: this door was only
    // ever half the hole, because the sibling GET /collections route read the
    // `decksUsers` join with no visibility filter of its own.
    return this.deckService.addToUserCollection(userId, deckId);
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
  @Authz(SCOPES.MANAGE_PRIVATE_DECK, byParam(ENTITIES.FLASHCARD_DECK))
  @Put(":id")
  async replace(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) deckId: string,
    @Body() deckDto: CreateFlashcardDeckDto
  ): Promise<FlashcardDeckResponse> {
    // `MANAGE_PRIVATE_DECK` is on the DECK_OWNER row and no other, so the
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
  @Authz(SCOPES.MANAGE_PRIVATE_DECK, byParam(ENTITIES.FLASHCARD_DECK))
  @Patch(":id")
  async updateDeck(
    @Req() request: AuthorizedRequest,
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
  @Authz(SCOPES.MANAGE_PRIVATE_DECK, byParam(ENTITIES.FLASHCARD_DECK))
  @Delete(":id")
  async delete(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) deckId: string
  ): Promise<boolean> {
    // MDRS-83 added the delete affordance to tedris behind a client-side
    // `isOwner` flag, and a Server Action is an HTTP endpoint like any other:
    // the flag is display-only. `decks.delete` filters on `decks.id` alone
    // and the cards FK cascades, so the guard above is what keeps one user's
    // deck — and its cards — out of another user's reach.
    return this.deckService.delete(deckId);
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
