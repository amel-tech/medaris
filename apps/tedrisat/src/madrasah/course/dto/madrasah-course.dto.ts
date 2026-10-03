import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";
import {
  OFFSITE_REQUEST_STATUSES,
  type OffsiteRequestStatus,
} from "../../../database/schema/offsite-course-request.schema";

const MAX_MUDERRIS = 20;

export class MadrasahCourseKoskResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "Nûruosmaniye Köşkü" })
  name!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: "Arapça dil ilimleri",
    description: "The köşk's ilim alanı",
  })
  field!: string | null;

  @ApiProperty({
    description:
      'The medrese\'s courses in this köşk that are not hidden, drafts included ("medresenin burada 1 dersi var")',
  })
  courseCount!: number;
}

export class OpenMadrasahCourseDto {
  @ApiProperty({
    format: "uuid",
    description: "A köşk the medrese holds a hosting right in",
  })
  @IsUUID()
  koskId!: string;

  @ApiProperty({ example: "Maksûd şerhi", minLength: 2, maxLength: 200 })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @ApiProperty({
    type: [String],
    format: "uuid",
    minItems: 1,
    maxItems: MAX_MUDERRIS,
    description:
      "The müderrisler' accounts, found with `GET /users/lookup`, in the order they are shown",
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_MUDERRIS)
  @IsUUID(undefined, { each: true })
  muderrisUserIds!: string[];

  @ApiPropertyOptional({
    format: "uuid",
    description:
      "The course's imam, one of `muderrisUserIds`. Left out, a lone müderris is the imam; with several it is required",
  })
  @IsOptional()
  @IsUUID()
  imamUserId?: string;

  @ApiPropertyOptional({
    description:
      "Kapalı ders. On whatever is sent when the medrese's policy requires it",
  })
  @IsOptional()
  @IsBoolean()
  closedCourse?: boolean;

  @ApiPropertyOptional({
    description:
      'Kayıt onayı gereksin. On whatever is sent when the medrese\'s policy is "Kayıt her zaman onaylı"',
  })
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;
}

export class SetMadrasahCourseMuderrisDto {
  @ApiProperty({
    type: [String],
    format: "uuid",
    minItems: 1,
    maxItems: MAX_MUDERRIS,
    description:
      "Every müderris the course is to have, in the order they are shown; the last one cannot be left out",
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_MUDERRIS)
  @IsUUID(undefined, { each: true })
  muderrisUserIds!: string[];

  @ApiPropertyOptional({
    format: "uuid",
    description:
      "The course's imam, one of `muderrisUserIds`. Left out, a lone müderris is the imam; with several it is required",
  })
  @IsOptional()
  @IsUUID()
  imamUserId?: string;
}

const OFFSITE_REASON_MAX = 2000;

export class CreateOffsiteCourseRequestDto {
  @ApiProperty({
    format: "uuid",
    description:
      "The köşk the medrese asks to open the course. Any köşk that is not hidden: this is for courses that will not belong to the medrese, so the medrese's hosting rights are neither required nor looked at",
  })
  @IsUUID()
  koskId!: string;

  @ApiProperty({
    example: "Erbaîn-i Nevevî okumaları",
    minLength: 2,
    maxLength: 200,
    description: "The name suggested; whoever opens the course may change it",
  })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @ApiProperty({
    minLength: 1,
    maxLength: OFFSITE_REASON_MAX,
    example:
      "Medresemizde bu metni okutan bir ders yok; müderrisliğini ben üstlenmek isterim.",
    description:
      "Why the course should open outside the medrese, and the müderrisler proposed. Required, and not blank",
  })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(OFFSITE_REASON_MAX)
  reason!: string;
}

export class OffsiteCourseRequestResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  madrasahId!: string;

  @ApiProperty({ format: "uuid" })
  koskId!: string;

  @ApiProperty({ example: "Nûruosmaniye Köşkü" })
  koskName!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  reason!: string;

  @ApiProperty({
    enum: Object.values(OFFSITE_REQUEST_STATUSES),
    description:
      "PENDING when sent. The köşk side accepts or rejects it in its own screens (nizam/39); until then it stays PENDING",
  })
  status!: OffsiteRequestStatus;

  @ApiProperty({ format: "uuid", description: "The account that sent it" })
  requestedById!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "Null when the account never signed in to tedrisat",
  })
  requestedByName!: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: Date;
}
