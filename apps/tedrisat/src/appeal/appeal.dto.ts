import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsNotEmpty, IsString, IsUUID, MaxLength } from "class-validator";
import { APPEAL_REASON_MAX } from "../database/schema/appeal.schema";

export const APPEAL_TABS = ["PENDING", "DECIDED"] as const;
export type AppealTab = (typeof APPEAL_TABS)[number];

export const APPEAL_NOTE_MAX = 1000;

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class CreateAppealDto {
  @ApiProperty({
    format: "uuid",
    description: "The medrese's course request the köşk refused",
  })
  @IsUUID()
  courseRequestId!: string;

  @ApiProperty({ maxLength: APPEAL_REASON_MAX })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(APPEAL_REASON_MAX)
  reason!: string;
}

export class RejectAppealDto {
  @ApiProperty({
    maxLength: APPEAL_NOTE_MAX,
    description: "The decision note the medrese reads. Required.",
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(APPEAL_NOTE_MAX)
  note!: string;
}

export class AppealRefResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class AppealSummaryResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ enum: ["PENDING", "ACCEPTED", "REJECTED"] })
  status!: string;

  @ApiProperty()
  reason!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  decisionNote!: string | null;

  @ApiProperty({ type: Date })
  createdAt!: Date;

  @ApiPropertyOptional({ type: Date, nullable: true })
  decidedAt!: Date | null;
}

/** One row of the medrese's İtirazlar: a refused request, and its appeal if one was opened. */
export class MadrasahAppealRowResponse {
  @ApiProperty({ format: "uuid" })
  courseRequestId!: string;

  @ApiProperty({ description: "The course the medrese asked for" })
  title!: string;

  @ApiProperty({ type: AppealRefResponse })
  kosk!: AppealRefResponse;

  @ApiProperty({ enum: ["PENDING", "ACCEPTED", "REJECTED"] })
  requestStatus!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  rejectReason!: string | null;

  @ApiPropertyOptional({ type: AppealSummaryResponse, nullable: true })
  appeal!: AppealSummaryResponse | null;
}

export class AppealPersonResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  name!: string | null;
}

export class AppealResponse extends AppealSummaryResponse {
  @ApiProperty({ type: AppealRefResponse })
  madrasah!: AppealRefResponse;

  @ApiProperty({ type: AppealRefResponse })
  kosk!: AppealRefResponse;

  @ApiProperty({ format: "uuid" })
  courseRequestId!: string;

  @ApiProperty({ description: "The course the medrese asked for" })
  title!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "The köşk's reason for refusing the request",
  })
  rejectReason!: string | null;

  @ApiProperty({ type: AppealPersonResponse })
  createdBy!: AppealPersonResponse;
}

export class AppealListResponse {
  @ApiProperty({ type: [AppealResponse] })
  items!: AppealResponse[];

  @ApiProperty({ description: "The Bekleyen tab's count" })
  pendingCount!: number;

  @ApiProperty({ description: "The Karara bağlanan tab's count" })
  decidedCount!: number;
}

export class AppealCreatedResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;
}
