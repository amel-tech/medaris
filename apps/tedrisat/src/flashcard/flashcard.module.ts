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
  // Services, never repositories, so importers cannot write past the ownership
  // checks. `FlashcardDeckService` is AuthzBindingsModule's role resolver
  // (MDRS-41) and both label services' readability gate; `FlashcardService` is
  // exported for its `findDeckId` alone — a card is authorized through its
  // parent deck, and `FlashcardLabelModule` has to resolve that parent before
  // it can ask `assertReadable` anything.
  exports: [FlashcardDeckService, FlashcardService],
})
export class FlashcardModule {}
