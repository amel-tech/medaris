import { AuthGuardModule, ExcelModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { FlashcardController } from "./flashcard.controller";
import { FlashcardRepository } from "./flashcard.repository";
import { FlashcardService } from "./flashcard.service";
import { FlashcardBulkService } from "./flashcard-bulk.service";
import { FlashcardDeckController } from "./flashcard-deck.controller";
import { FlashcardDeckRepository } from "./flashcard-deck.repository";
import { FlashcardDeckService } from "./flashcard-deck.service";

@Module({
  imports: [AuthGuardModule, ExcelModule],
  controllers: [FlashcardController, FlashcardDeckController],
  providers: [
    FlashcardService,
    FlashcardRepository,
    FlashcardDeckService,
    FlashcardDeckRepository,
    FlashcardBulkService,
    DatabaseService,
  ],
})
export class FlashcardModule {}
