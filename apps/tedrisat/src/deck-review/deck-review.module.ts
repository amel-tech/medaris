import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { KoskModule } from "../kosk/kosk.module";
import { NotificationModule } from "../notification/notification.module";
import { DeckReviewRepository } from "./deck-review.repository";
import { DeckReviewService } from "./deck-review.service";
import { KoskDecksController } from "./kosk-decks.controller";
import { NizamDeckRequestsController } from "./nizam-deck-requests.controller";

/** The nizam's deck screens (MDRS-180): publish requests, köşk decks, proposals. */
@Module({
  imports: [AuthGuardModule, DatabaseModule, KoskModule, NotificationModule],
  controllers: [NizamDeckRequestsController, KoskDecksController],
  providers: [DeckReviewService, DeckReviewRepository],
})
export class DeckReviewModule {}
