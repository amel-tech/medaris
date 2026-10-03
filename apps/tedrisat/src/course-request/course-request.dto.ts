import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsNotEmpty, IsString, IsUUID, MaxLength } from "class-validator";

export const COURSE_REQUEST_TABS = ["PENDING", "DECIDED"] as const;
export type CourseRequestTab = (typeof COURSE_REQUEST_TABS)[number];

export const COURSE_REQUEST_TITLE_MAX = 200;
export const COURSE_REQUEST_REASON_MAX = 2000;

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class CreateCourseRequestDto {
  @ApiProperty({
    format: "uuid",
    description: "The medrese the request is sent from",
  })
  @IsUUID()
  madrasahId!: string;

  @ApiProperty({
    maxLength: COURSE_REQUEST_TITLE_MAX,
    example: "Usûl-i Fıkıh Okumaları",
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(COURSE_REQUEST_TITLE_MAX)
  title!: string;

  @ApiProperty({ maxLength: COURSE_REQUEST_REASON_MAX })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(COURSE_REQUEST_REASON_MAX)
  reason!: string;
}

export class AcceptCourseRequestDto {
  @ApiProperty({
    format: "uuid",
    description:
      "The course opened from the request in this köşk; the request is accepted with it.",
  })
  @IsUUID()
  courseId!: string;
}

export class CourseRequestPersonResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  name!: string | null;
}

export class CourseRequestRefResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class CourseRequestResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ description: "The course the medrese asks to open" })
  title!: string;

  @ApiProperty()
  reason!: string;

  @ApiProperty({ enum: ["PENDING", "ACCEPTED", "REJECTED"] })
  status!: string;

  @ApiProperty({ type: CourseRequestRefResponse })
  kosk!: CourseRequestRefResponse;

  @ApiProperty({ type: CourseRequestRefResponse })
  madrasah!: CourseRequestRefResponse;

  @ApiProperty({ type: CourseRequestPersonResponse })
  requestedBy!: CourseRequestPersonResponse;

  @ApiProperty({ type: Date })
  createdAt!: Date;

  @ApiPropertyOptional({ type: Date, nullable: true })
  decidedAt!: Date | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  rejectReason!: string | null;

  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  courseId!: string | null;
}

export class CourseRequestListResponse {
  @ApiProperty({ type: [CourseRequestResponse] })
  items!: CourseRequestResponse[];

  @ApiProperty({ description: "The Bekleyen tab's count" })
  pendingCount!: number;

  @ApiProperty({ description: "The Karara bağlanan tab's count" })
  decidedCount!: number;
}
