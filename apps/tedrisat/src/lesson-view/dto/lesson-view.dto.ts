import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsInt, IsOptional, Max, Min } from "class-validator";

/** Longest video a position or a length can describe: 99:59:59. */
export const LESSON_VIEW_SECONDS_MAX = 359_999;

/**
 * The share of a video that counts it watched (MDRS-248): nine tenths, so the
 * closing words and the credits a talebe skips do not keep the mark away.
 */
export const LESSON_VIEW_COMPLETE_SHARE = 0.9;

/** `PUT /lessons/:id/view` (MDRS-248): where the player is now. */
export class RecordLessonViewDto {
  @ApiProperty({
    minimum: 0,
    maximum: LESSON_VIEW_SECONDS_MAX,
    example: 754,
    description:
      "The player's position in whole seconds from the start of the video: where “Kaldığın yer” goes back to.",
  })
  @IsInt()
  @Min(0)
  @Max(LESSON_VIEW_SECONDS_MAX)
  positionSeconds!: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: LESSON_VIEW_SECONDS_MAX,
    example: 3480,
    description:
      "The video's length in whole seconds, as the player reports it. Left out when the player has not said; the last length stored stays.",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(LESSON_VIEW_SECONDS_MAX)
  durationSeconds?: number;

  @ApiPropertyOptional({
    description:
      "True when the player reported that the video ended. It marks the celse watched, like reaching nine tenths of it.",
  })
  @IsOptional()
  @IsBoolean()
  ended?: boolean;
}

/** How far the caller has watched one celse (MDRS-248). */
export class LessonViewResponse {
  @ApiProperty({ format: "uuid" })
  lessonId!: string;

  @ApiProperty({
    description:
      "Where the player last was, in whole seconds from the start of the video.",
  })
  positionSeconds!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      "The video's length in whole seconds, as the player reported it; null until it did.",
  })
  durationSeconds!: number | null;

  @ApiProperty({
    type: Date,
    nullable: true,
    description:
      "When the celse first counted as watched (the video ended, or nine tenths of it played); null until then. It stays once set.",
  })
  completedAt!: Date | null;

  @ApiProperty({ type: Date })
  updatedAt!: Date;
}
