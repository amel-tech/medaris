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
  CreateFlashcardLabelDto,
  CreateFlashcardLabelingDto,
} from "./dto/create-flashcard-label.dto";
import {
  FlashcardCreateLabelResponse,
  FlashcardLabelingResponse,
  FlashcardLabelResponse,
  labelStatsResponse,
} from "./dto/flashcard-label-response.dto";
import { FlashcardLabelService } from "./flashcard-label.service";
import { AuthorizedRequest } from "./interfaces/authorized-request.interface";

/**
 * Every route here was reachable with no token at all (MDRS-27). This class
 * carried no guard, unlike kosk.controller.ts:37, course.controller.ts:39,
 * flashcard.controller.ts:65 and flashcard-deck.controller.ts:46 — so all five
 * routes, three of them mutating, answered anonymous callers.
 *
 * The actor is now taken from the verified token rather than the request body.
 * `createdBy` and `userId` used to be client-supplied fields on the DTOs, which
 * meant that even behind a guard any authenticated caller could attribute a
 * label to somebody else. They are gone from the DTOs, so the global pipe
 * (`forbidNonWhitelisted: true`) now rejects a request that tries to send them.
 *
 * Scope note: this closes the AUTHENTICATION hole only. Whether the caller may
 * label a card or deck they do not own is ownership, and belongs with the
 * flashcard ownership work — see MDRS-26. Nothing here checks that yet.
 */
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("flashcard-label")
export class FlashcardlabelController {
  constructor(private readonly labelService: FlashcardLabelService) {}

  @ApiBody({ type: CreateFlashcardLabelDto })
  @ApiResponse({ status: 200, type: FlashcardCreateLabelResponse })
  @Post("/create")
  async createFlashcardLabel(
    @Req() request: AuthorizedRequest,
    @Body() createLabelDto: CreateFlashcardLabelDto
  ): Promise<FlashcardCreateLabelResponse> {
    const userId = request.user.sub;
    return await this.labelService.createLabel({
      ...createLabelDto,
      createdBy: userId,
      userId,
    });
  }

  @ApiResponse({ status: 200, schema: { type: "boolean" } })
  @Delete("/delete/:id")
  async deleteFlashcardLabel(
    @Param("id", ParseUUIDPipe) labelId: string
  ): Promise<boolean> {
    return await this.labelService.deleteLabel(labelId);
  }

  @ApiBody({ type: CreateFlashcardLabelingDto })
  @ApiResponse({ status: 200, type: FlashcardLabelingResponse })
  @Post("/labeling")
  async flahscardLabeling(
    @Req() request: AuthorizedRequest,
    @Body() newLabeling: CreateFlashcardLabelingDto
  ): Promise<FlashcardLabelingResponse> {
    return await this.labelService.flashcardLabeling({
      ...newLabeling,
      createdBy: request.user.sub,
    });
  }

  @ApiResponse({ status: 200, type: FlashcardLabelResponse })
  @Get("/:id")
  async getById(
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<FlashcardLabelResponse | null> {
    return await this.labelService.getById(id);
  }

  @ApiResponse({ status: 200, type: labelStatsResponse })
  @Get("/getStats/:id")
  async getLabelStats(
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<labelStatsResponse | null> {
    return await this.labelService.getLabelStats(id);
  }
}
