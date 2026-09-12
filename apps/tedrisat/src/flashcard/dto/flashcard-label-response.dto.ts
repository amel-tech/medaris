import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsString } from "class-validator";
import { Scope } from "../domain/flashcard-label.enum";
import {
  CreateFlashcardLabelDto,
  CreateFlashcardLabelingDto,
} from "./create-flashcard-label.dto";
export class FlashcardCreateLabelResponse extends CreateFlashcardLabelDto {
  // The row's own id, so a client that creates a label can address it
  // (`GET /:id`, `getStats/:id`, `DELETE /delete/:id`) without a lookup no
  // route offers. Published for the first time by MDRS-58; it was on the wire
  // all along.
  @ApiProperty()
  @IsString()
  declare id: string;
  @ApiProperty()
  @IsString()
  declare userId: string;
  @ApiProperty()
  @IsString()
  declare title: string;
  @ApiProperty()
  declare createdBy: string;
  @ApiProperty()
  declare scope: Scope;
}
export class FlashcardLabelingResponse extends CreateFlashcardLabelingDto {
  @ApiProperty()
  @IsString()
  declare labelId: string;
  @ApiProperty()
  @IsString()
  declare flashcardId: string;
  @ApiProperty()
  @IsString()
  declare createdBy: string;
}
export class FlashcardLabelResponse {
  @ApiProperty()
  @IsString()
  declare id: string;
  @ApiProperty()
  @IsString()
  declare userId: string;
  @ApiProperty()
  @IsString()
  declare title: string;
  @ApiProperty()
  @IsString()
  declare createdBy: string;
  @ApiProperty()
  declare scope: Scope;
}
export class labelStatsResponse {
  @ApiProperty()
  @IsString()
  declare labelId: string;
  @ApiProperty()
  declare usageCount: number;
  // Null until the label is first applied: the stats row is created lazily, and
  // an unused label answers 200 with zero counts rather than 404.
  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  declare lastUsedAt: Date | null;
}
