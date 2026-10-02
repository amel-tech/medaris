import { OmitType, PartialType } from "@nestjs/swagger";
import { CreateFlashcardDeckDto } from "./create-flashcard-deck.dto";

// `cardType` is fixed at creation: the deck's cards were written for it.
export class UpdateFlashcardDeckDto extends PartialType(
  OmitType(CreateFlashcardDeckDto, ["cardType"] as const)
) {}
