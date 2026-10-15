import { HOCA_UNVANS, type HocaUnvan } from "@medaris/utils/src/hoca-unvan.js";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { HOCA_UNVAN_PROPERTY, MuderrisResponse } from "./course-response.dto";

export class MuderrisListItemDto {
  @ApiProperty({ format: "uuid", description: "The müderris' account." })
  @IsUUID()
  userId!: string;

  @ApiProperty({ example: "Ahmet Yılmaz" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: "Hoca" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}

/** The müderris list of one course, replaced whole with its imam (MDRS-176). */
export class SetMuderrisDto {
  @ApiProperty({
    example: 3,
    minimum: 0,
    description:
      "The course `version` the caller last saw. A stale value is refused " +
      "with 409 COURSE_VERSION_CONFLICT.",
  })
  @IsInt()
  @Min(0)
  version!: number;

  @ApiProperty({ type: [MuderrisListItemDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => MuderrisListItemDto)
  muderris!: MuderrisListItemDto[];

  @ApiProperty({
    format: "uuid",
    description: "The imam; one of the accounts in `muderris`.",
  })
  @IsUUID()
  imamUserId!: string;
}

/**
 * The unvan of one hoca in one course (Ders ayarları). `required: false` only
 * so the generated client accepts a null; the key must be sent.
 */
export class SetMuderrisUnvanDto {
  @ApiProperty({
    ...HOCA_UNVAN_PROPERTY,
    required: false,
    example: "PROF_DR",
    description:
      "The unvan to give, or null for none (the name reads `{name} Hoca`). The key must be sent: a body without it, or with a code not in the list, is 400.",
  })
  @ValidateIf((_: unknown, value: unknown) => value !== null)
  @IsIn([...HOCA_UNVANS])
  unvan!: HocaUnvan | null;
}

export class MuderrisListResponse {
  @ApiProperty({ type: [MuderrisResponse] }) muderris!: MuderrisResponse[];
  @ApiProperty({ description: "The course version this write produced." })
  courseVersion!: number;
}

export class CancelLessonDto {
  @ApiProperty({ example: 3, minimum: 0 })
  @IsInt()
  @Min(0)
  version!: number;

  @ApiPropertyOptional({ example: "Müderris hasta" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({
    format: "uuid",
    description:
      "The session that makes up for this one (telafi). It must be a live " +
      "session of the same course that is not cancelled, is not this session " +
      "and is not already another session's make-up. Left out, the session is " +
      "cancelled with no make-up.",
  })
  @IsOptional()
  @IsUUID()
  replacementLessonId?: string;
}
