import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsString,
  IsTimeZone,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";
import { MAX_BATCH_SESSIONS } from "../domain/weekly-pattern";
import { LessonResponse } from "./course-response.dto";
import { toCanonicalTimeZone } from "./create-course.dto";

/**
 * Optional, but never null: `@IsOptional()` lets `null` through unvalidated,
 * and here a null `count` or `endDate` would read as "not given".
 */
const Omittable = () =>
  ValidateIf((_: unknown, value: unknown) => value !== undefined);

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "Every Tuesday and Thursday at 21:00, from 6 October, 8 times" (MDRS-109). */
export class WeeklyPatternDto {
  @ApiProperty({
    type: [Number],
    example: [2, 4],
    description: "ISO weekdays the session falls on: 1 = Monday … 7 = Sunday.",
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekdays!: number[];

  @ApiProperty({
    example: "21:00",
    description: "Local start time, 24-hour HH:mm, in `timeZone`.",
  })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: "$property must be a 24-hour HH:mm time",
  })
  startTime!: string;

  @ApiPropertyOptional({
    example: "Europe/Istanbul",
    description:
      "IANA zone the start time is meant in; the course's zone when omitted. " +
      "Sessions keep this local time across daylight-saving changes.",
  })
  @Transform(toCanonicalTimeZone)
  @Omittable()
  @IsTimeZone()
  @MaxLength(64)
  timeZone?: string;

  @ApiProperty({
    example: "2026-10-06",
    description:
      "First calendar day of the range, YYYY-MM-DD. The Monday-to-Sunday " +
      'week that holds it is "Hafta 1".',
  })
  @IsString()
  @Matches(DATE, { message: "$property must be a YYYY-MM-DD date" })
  startDate!: string;

  @ApiPropertyOptional({
    example: "2026-11-30",
    description: "Last calendar day, inclusive. Exactly one of this or count.",
  })
  @Omittable()
  @IsString()
  @Matches(DATE, { message: "$property must be a YYYY-MM-DD date" })
  endDate?: string;

  @ApiPropertyOptional({
    example: 8,
    minimum: 1,
    maximum: MAX_BATCH_SESSIONS,
    description: "How many sessions to create. Exactly one of this or endDate.",
  })
  @Omittable()
  @IsInt()
  @Min(1)
  @Max(MAX_BATCH_SESSIONS)
  count?: number;
}

export class CreateSessionBatchDto extends WeeklyPatternDto {
  @ApiProperty({
    example: "Canlı ders",
    description: "Title every generated session starts with.",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: 60, minimum: 1, maximum: 1440 })
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMinutes!: number;

  @ApiPropertyOptional({
    example: "https://meet.google.com/bqx-mfzn-rde",
    description:
      "Set on the first session only. Links change every week, so the " +
      "others start empty.",
  })
  @Omittable()
  @IsUrl(
    { require_protocol: true, protocols: ["https"] },
    { message: "$property must be an https:// URL" }
  )
  @MaxLength(500)
  meetingUrl?: string;
}

export class PlannedSessionResponse {
  @ApiProperty({ example: "2026-10-06T18:00:00.000Z" }) scheduledAt!: Date;
  @ApiProperty({
    example: "2026-10-06",
    description: "Calendar date in the pattern's zone.",
  })
  localDate!: string;
  @ApiProperty({ example: 1 }) weekNumber!: number;
}

export class SessionBatchPreviewResponse {
  @ApiProperty({ example: "Europe/Istanbul" }) timeZone!: string;
  @ApiProperty({ type: [PlannedSessionResponse] })
  sessions!: PlannedSessionResponse[];
}

export class SessionBatchWeekResponse {
  @ApiProperty() id!: string;
  @ApiProperty() weekNumber!: number;
  @ApiProperty() title!: string;
  @ApiProperty({ description: "Whether this batch created the week." })
  created!: boolean;
}

export class SessionBatchLessonResponse extends LessonResponse {
  @ApiProperty() weekNumber!: number;
}

export class SessionBatchResponse {
  @ApiProperty({
    description:
      "The course version this write produced; send it with the next PUT " +
      "/courses/:id or PATCH /lessons/:id.",
  })
  courseVersion!: number;
  @ApiProperty({ example: "Europe/Istanbul" }) timeZone!: string;
  @ApiProperty({ type: [SessionBatchWeekResponse] })
  weeks!: SessionBatchWeekResponse[];
  @ApiProperty({ type: [SessionBatchLessonResponse] })
  lessons!: SessionBatchLessonResponse[];
}
