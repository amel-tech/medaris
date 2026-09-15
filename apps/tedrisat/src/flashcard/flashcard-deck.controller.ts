import { AuthGuard } from "@medaris/common";
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
@UseGuards(AuthGuard)
@Controller("flashcard/decks")
export class FlashcardDeckController {
  constructor(private readonly deckService: FlashcardDeckService) {}

  // GET Requests

  @ApiOperation({
    summary: "Get all flashcard decks in the user's collection",
    operationId: "getAllFlashcardDecksByUser",
  })
  @ApiOkResponse({ type: FlashcardDeckResponse, isArray: true })
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
  @Get(":id")
  async findById(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) deckId: string,
    @IncludeQuery() include?: string[]
  ): Promise<FlashcardDeckResponse> {
    // `findAllVisibleToUser` scopes the list route to public-or-own decks;
    // this route filtered on `decks.id` alone, so somebody else's private
    // deck came back in full to any authenticated caller who knew its id.
    // `assertReadable` rather than `assertOwner` — a public deck is meant to
    // be browsable by everyone.
    await this.deckService.assertReadable(deckId, request.user.sub);
    const deck = await this.deckService.findById(deckId, include);
    if (!deck) {
      throw new HttpException(
        `no deck was found by id #${deckId}`,
        HttpStatus.NOT_FOUND
      );
    }
    return deck;
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
  @Post(":id/collections")
  async addToUserCollection(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) deckId: string
  ): Promise<FlashcardDeckUserResponse> {
    const userId = request.user.sub;
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
  @Put(":id")
  async replace(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) deckId: string,
    @Body() deckDto: CreateFlashcardDeckDto
  ): Promise<FlashcardDeckResponse> {
    // `CreateFlashcardDeckDto` carries `isPublic`, so without this any
    // authenticated caller could flip somebody else's private deck to public
    // — which `TedrisatRoleResolver.resolveDeckRole` then reads, turning a
    // deny into ROLES.PUBLIC for every other caller once MDRS-43 wires the
    // guard. Asserted at the edge, like the deck-scoped card writes.
    await this.deckService.assertOwner(deckId, request.user.sub);
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
  @Patch(":id")
  async updateDeck(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) deckId: string,
    @Body() deckDto: UpdateFlashcardDeckDto
  ): Promise<FlashcardDeckResponse> {
    // Same reason as `replace` above: `UpdateFlashcardDeckDto` exposes
    // `isPublic`, and visibility must stay the author's decision.
    await this.deckService.assertOwner(deckId, request.user.sub);
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
  @Delete(":id")
  async delete(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) deckId: string
  ): Promise<boolean> {
    // MDRS-83 added the delete affordance to tedris behind a client-side
    // `isOwner` flag, and a Server Action is an HTTP endpoint like any other:
    // the flag is display-only. `decks.delete` filters on `decks.id` alone
    // and the cards FK cascades, so this is the assertion that keeps one
    // user's deck — and its cards — out of another user's reach.
    await this.deckService.assertOwner(deckId, request.user.sub);
    return this.deckService.delete(deckId);
  }

  @ApiOperation({
    summary: "Delete a flashcard deck from user's collection",
    operationId: "deleteFlashcardDeckUser",
  })
  @ApiOkResponse({ type: FlashcardDeckUserResponse })
  @Delete(":id/collections")
  async removeFromUserCollection(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) deckId: string
  ): Promise<FlashcardDeckUserResponse> {
    const userId = request.user.sub;
    return this.deckService.removeFromUserCollection(userId, deckId);
  }
}
