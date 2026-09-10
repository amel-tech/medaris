import { AuthGuard } from "@medaris/common";
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiResponse } from "@nestjs/swagger";
import {
  CreateFlashcardDeckLabelDto,
  CreateFlashcardDeckLabelingDto,
} from "./dto/create-flashcard-deck-label.dto";
import {
  DeckLabelStatsResponse,
  FlashcardDeckCreateLabelResponse,
  FlashcardDeckLabelingResponse,
  FlashcardDeckLabelResponse,
} from "./dto/flashcard-deck-label-response.dto";
import { FlashcardDeckLabelService } from "./flashcard-deck-label.service";
import { AuthorizedRequest } from "./interfaces/authorized-request.interface";

/**
 * See flashcard-label.controller.ts for the reasoning — same fix, same MDRS-27,
 * including the ownership assertion on DELETE. One difference worth knowing:
 * `deckLabels` has no `userId` column, so ownership here is `createdBy`.
 *
 * MDRS-56 covers the two read routes here as well, on the same terms and with
 * the same PUBLIC-scope decision: reads are OWNER-ONLY and `scope` is not
 * consulted. The full argument is in flashcard-label.controller.ts; it is not
 * repeated here because the two must not be allowed to drift apart.
 */
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("flashcard-deck-label")
export class FlashcardDeckLabelController {
  constructor(private readonly labelService: FlashcardDeckLabelService) {}

  @ApiBody({ type: CreateFlashcardDeckLabelDto })
  @ApiResponse({ status: 200, type: FlashcardDeckCreateLabelResponse })
  @Post("/create")
  async createFlashcardDeckLabel(
    @Req() request: AuthorizedRequest,
    @Body() createLabelDto: CreateFlashcardDeckLabelDto
  ): Promise<FlashcardDeckCreateLabelResponse> {
    return await this.labelService.createLabel({
      ...createLabelDto,
      createdBy: request.user.sub,
    });
  }

  @ApiResponse({ status: 200, schema: { type: "boolean" } })
  @ApiResponse({
    status: 403,
    description: "The label belongs to another user",
  })
  @ApiResponse({ status: 404, description: "No label with that id" })
  @Delete("/delete/:id")
  async deleteFlashcardDeckLabel(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) labelId: string
  ): Promise<boolean> {
    return await this.labelService.deleteLabel(labelId, request.user.sub);
  }

  @ApiBody({ type: CreateFlashcardDeckLabelingDto })
  @ApiResponse({ status: 200, type: FlashcardDeckLabelingResponse })
  @Post("/labeling")
  async deckLabeling(
    @Req() request: AuthorizedRequest,
    @Body() newLabeling: CreateFlashcardDeckLabelingDto
  ): Promise<FlashcardDeckLabelingResponse> {
    return await this.labelService.deckLabeling({
      ...newLabeling,
      createdBy: request.user.sub,
    });
  }

  @ApiResponse({ status: 200, type: FlashcardDeckLabelResponse })
  @ApiResponse({
    status: 403,
    description: "The label belongs to another user",
  })
  @ApiResponse({ status: 404, description: "No label with that id" })
  @Get("/:id")
  async getById(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<FlashcardDeckLabelResponse> {
    return await this.labelService.getById(id, request.user.sub);
  }

  @ApiResponse({ status: 200, type: DeckLabelStatsResponse })
  @ApiResponse({
    status: 403,
    description: "The label belongs to another user",
  })
  @ApiResponse({ status: 404, description: "No label with that id" })
  @Get("/getStats/:id")
  async getLabelStats(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<DeckLabelStatsResponse | null> {
    return await this.labelService.getDeckLabelStats(id, request.user.sub);
  }
}
