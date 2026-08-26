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
 * DELETE additionally asserts ownership. Authentication alone left a real hole:
 * the route took an id straight to `delete ... where id = ?`, so any logged-in
 * caller who guessed a UUID could destroy another user's label — and because
 * `flashcard_labelings` and `flashcard_label_stats` both reference it
 * `onDelete: "cascade"` (flashcard-label.schema.ts:19 and :32), every labeling
 * that user had attached went with it. `deleteLabel` now takes the caller and
 * goes through `FlashcardLabelService.assertOwner`: 404 for a missing label,
 * 403 for somebody else's.
 *
 * MDRS-56 extends the same assertion to the two READ routes. `GET /:id` and
 * `GET /getStats/:id` carried the class guard but no ownership check, so any
 * authenticated caller who guessed a UUID could read another user's label —
 * its title, its scope and its usage count. Not destructive like the delete
 * hole, but the same defect: authenticated is not authorized.
 *
 * PUBLIC-scope decision, which MDRS-56 required to be recorded here: reads are
 * OWNER-ONLY, scope is not consulted, identical to delete. A PUBLIC label is
 * readable only by its author today. Three reasons, in order of weight:
 *
 *  1. There is no policy layer to express "PUBLIC means world-readable" in.
 *     Reading `scope` here would be a second, hand-rolled authorization rule
 *     living in a service, which is exactly the mechanism MDRS-41 exists to
 *     port and MDRS-43 to apply. Guessing its semantics ahead of it is how you
 *     end up with two contradictory models.
 *  2. No caller is affected. Neither controller has a list route, and no web
 *     app in this workspace calls either path (grepped, 2026-08-26), so
 *     nothing today reaches a PUBLIC label by id. Owner-only costs no
 *     behaviour that anyone currently uses.
 *  3. Closed is the reversible direction. Opening PUBLIC reads later is an
 *     additive change to one predicate; discovering that PUBLIC leaked
 *     something it should not have is a disclosure.
 *
 * Deliberately the stricter reading of the issue, which suggested PUBLIC
 * "probably should" be readable by anyone. If that is the product intent, it
 * belongs with the scope/visibility model, not with a UUID lookup.
 *
 * Scope note: the REST of this controller closes the AUTHENTICATION hole only.
 * Whether the caller may label a card or deck they do not own is still
 * unchecked and belongs with the flashcard ownership work — see MDRS-26.
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
  @ApiResponse({
    status: 403,
    description: "The label belongs to another user",
  })
  @ApiResponse({ status: 404, description: "No label with that id" })
  @Delete("/delete/:id")
  async deleteFlashcardLabel(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) labelId: string
  ): Promise<boolean> {
    return await this.labelService.deleteLabel(labelId, request.user.sub);
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
  @ApiResponse({
    status: 403,
    description: "The label belongs to another user",
  })
  @ApiResponse({ status: 404, description: "No label with that id" })
  @Get("/:id")
  async getById(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<FlashcardLabelResponse | null> {
    return await this.labelService.getById(id, request.user.sub);
  }

  @ApiResponse({ status: 200, type: labelStatsResponse })
  @ApiResponse({
    status: 403,
    description: "The label belongs to another user",
  })
  @ApiResponse({ status: 404, description: "No label with that id" })
  @Get("/getStats/:id")
  async getLabelStats(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<labelStatsResponse | null> {
    return await this.labelService.getLabelStats(id, request.user.sub);
  }
}
