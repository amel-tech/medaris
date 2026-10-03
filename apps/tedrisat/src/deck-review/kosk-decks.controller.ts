import { AuthGuard } from "@medaris/common";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { AuthenticatedUserRequest } from "../user/interfaces/authenticated-user-request.interface";
import { DeckReviewService } from "./deck-review.service";
import {
  CreateDeckProposalDto,
  CreatedIdResponse,
  CreateKoskDeckDto,
  ManagedKoskDecksResponse,
  RejectReasonDto,
} from "./dto/deck-review.dto";

/**
 * A köşk's own decks, the proposals müderrises make for them and Gizle
 * (MDRS-180, nizam/30 and 35). Like `ArchiveController`, no `AuthzGuard`:
 * `DeckReviewService` decides — a nazım of the köşk, or the başnazım.
 */
@ApiTags("kosks")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class KoskDecksController {
  constructor(private readonly review: DeckReviewService) {}

  @ApiOperation({
    summary: "A köşk's decks and the proposals waiting for an answer",
    description:
      "The shown köşk decks with their card counts and the müderris proposals nobody has answered. A nazım of the köşk or SYSTEM_ADMIN.",
    operationId: "getManagedKoskDecks",
  })
  @ApiOkResponse({ type: ManagedKoskDecksResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Get("kosks/:id/decks/manage")
  async decks(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<ManagedKoskDecksResponse> {
    return this.review.koskDecks(request.user, id);
  }

  @ApiOperation({
    summary: "Open a köşk deck (Desteyi aç)",
    description:
      "The deck is private to nobody but the köşk's talebe: its cards are added afterwards. With `proposalId` the proposal is accepted in the same step; 409 (DECK_PROPOSAL_NOT_PENDING) when it was answered meanwhile.",
    operationId: "createKoskDeck",
  })
  @ApiCreatedResponse({ type: CreatedIdResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: "DECK_PROPOSAL_NOT_PENDING" })
  @Post("kosks/:id/decks")
  createDeck(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateKoskDeckDto
  ): Promise<{ id: string }> {
    return this.review.createKoskDeck(request.user, id, dto);
  }

  @ApiOperation({
    summary: "Suggest a deck for the köşk",
    description:
      "A müderris of one of the köşk's courses. The köşk nazımı accepts it by opening the deck, or refuses it with a reason.",
    operationId: "proposeKoskDeck",
  })
  @ApiCreatedResponse({ type: CreatedIdResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Post("kosks/:id/deck-proposals")
  propose(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateDeckProposalDto
  ): Promise<{ id: string }> {
    return this.review.propose(request.user, id, dto);
  }

  @ApiOperation({
    summary: "Refuse a proposal (Reddet)",
    description:
      "The proposer reads the reason in their notifications. The reason is required.",
    operationId: "rejectKoskDeckProposal",
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: "DECK_PROPOSAL_NOT_PENDING" })
  @Post("kosks/:id/deck-proposals/:proposalId/reject")
  @HttpCode(HttpStatus.NO_CONTENT)
  rejectProposal(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("proposalId", ParseUUIDPipe) proposalId: string,
    @Body() dto: RejectReasonDto
  ): Promise<void> {
    return this.review.rejectProposal(request.user, id, proposalId, dto.reason);
  }

  @ApiOperation({
    summary: "Hide a köşk deck (Gizle)",
    description:
      "Nothing is deleted: the deck moves to the köşk's archive, where Geri al brings it back.",
    operationId: "hideKoskDeck",
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Post("decks/:id/hide")
  @HttpCode(HttpStatus.NO_CONTENT)
  hide(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<void> {
    return this.review.hideDeck(request.user, id);
  }
}
