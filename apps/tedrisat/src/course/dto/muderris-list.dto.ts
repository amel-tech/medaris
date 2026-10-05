import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { MuderrisResponse } from "./course-response.dto";

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
