import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { FlashcardDeckLabelController } from "./flashcard-deck-label.controller";
import { FlashcardDeckLabelRepository } from "./flashcard-deck-label.repository";
import { FlashcardDeckLabelService } from "./flashcard-deck-label.service";
import { FlashcardlabelController } from "./flashcard-label.controller";
import { FlashcardLabelRepository } from "./flashcard-label.reporsitory";
import { FlashcardLabelService } from "./flashcard-label.service";

@Module({
  // AuthGuardModule is NOT @Global — without this import the guard on both
  // controllers is a Nest DI failure at container build, which surfaces as a
  // failing test target rather than a compile error.
  imports: [AuthGuardModule],
  controllers: [FlashcardlabelController, FlashcardDeckLabelController],
  providers: [
    FlashcardLabelService,
    FlashcardLabelRepository,
    FlashcardDeckLabelService,
    FlashcardDeckLabelRepository,
    DatabaseService,
  ],
})
export class FlashcardLabelModule {}
