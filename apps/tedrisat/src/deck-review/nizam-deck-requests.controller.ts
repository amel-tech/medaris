import { AuthGuard } from "@medaris/common";
import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseEnumPipe,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { AuthenticatedUserRequest } from "../user/interfaces/authenticated-user-request.interface";
import { DeckReviewService } from "./deck-review.service";
import {
  DECK_REQUEST_STATUSES,
  DeckPublishRequestListResponse,
  DeckRequestCardsResponse,
  type DeckRequestStatus,
  RejectReasonDto,
} from "./dto/deck-review.dto";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, pagingOf } from "./paging";

/**
 * The başnazım's review of deck publish requests (MDRS-180, nizam/16). No
 * `AuthzGuard`: the engine has no entity for a request, so `DeckReviewService`
 * makes the one decision every route shares.
 */
@ApiTags("nizam")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("nizam/deck-publish-requests")
export class NizamDeckRequestsController {
  constructor(private readonly review: DeckReviewService) {}

  @ApiOperation({
    summary: "Deck publish requests (Bekleyen / Karara bağlanan)",
    description:
      "The members' requests to make a deck public, oldest waiting first, or the answered ones, newest first, a page at a time. Both tab counts (every request, not the page) come with it. The Medaris başnazımı (SYSTEM_ADMIN) only.",
    operationId: "listDeckPublishRequests",
  })
  @ApiQuery({
    name: "status",
    required: false,
    enum: DECK_REQUEST_STATUSES,
    enumName: "DeckRequestStatus",
  })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: `1 to ${MAX_PAGE_SIZE}; default ${DEFAULT_PAGE_SIZE}.`,
  })
  @ApiOkResponse({ type: DeckPublishRequestListResponse })
  @ApiForbiddenResponse()
  @Get()
  async list(
    @Req() request: AuthenticatedUserRequest,
    @Query(
      "status",
      new DefaultValuePipe("PENDING"),
      new ParseEnumPipe(DECK_REQUEST_STATUSES)
    )
    status: DeckRequestStatus,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(DEFAULT_PAGE_SIZE), ParseIntPipe)
    limit: number
  ): Promise<DeckPublishRequestListResponse> {
    const { items, counts } = await this.review.listRequests(
      request.user,
      status,
      pagingOf(page, limit)
    );
    return {
      items,
      pendingCount: counts.pending,
      decidedCount: counts.decided,
    };
  }

  @ApiOperation({
    summary: "The cards of a requested deck",
    description:
      "Three sample cards, or every card with `all=true`. The deck is private until it is published, so each read is written to the audit log (`deck.private-read`) before the cards are returned.",
    operationId: "readDeckPublishRequestCards",
  })
  @ApiQuery({ name: "all", required: false, type: Boolean })
  @ApiOkResponse({ type: DeckRequestCardsResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Get(":id/cards")
  readCards(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query("all", new DefaultValuePipe(false), ParseBoolPipe) all: boolean
  ): Promise<DeckRequestCardsResponse> {
    return this.review.readCards(request.user, id, all);
  }

  @ApiOperation({
    summary: "Publish the deck (Yayımla)",
    description:
      "The deck becomes public and its owner is told. 409 (DECK_REQUEST_NOT_PENDING) when it was answered or withdrawn meanwhile.",
    operationId: "approveDeckPublishRequest",
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: "DECK_REQUEST_NOT_PENDING" })
  @Post(":id/approve")
  @HttpCode(HttpStatus.NO_CONTENT)
  approve(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<void> {
    return this.review.approve(request.user, id);
  }

  @ApiOperation({
    summary: "Refuse the request (Reddet)",
    description:
      "The deck stays private, the reason goes to its owner, who may ask again. The reason is required.",
    operationId: "rejectDeckPublishRequest",
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: "DECK_REQUEST_NOT_PENDING" })
  @Post(":id/reject")
  @HttpCode(HttpStatus.NO_CONTENT)
  reject(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RejectReasonDto
  ): Promise<void> {
    return this.review.reject(request.user, id, dto.reason);
  }
}
