import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from "class-validator";
import { KoskPersonResponse } from "./kosk-admin.dto";

/** More than the course catalog can ever hold; a longer list is nonsense. */
const MAX_PERMISSIONS = 40;

export class KoskGrantCourseResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "Emsile ve Bina" })
  title!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      "The medrese the course is the work of; null for a medrese-free course. A medrese's permissions come from its own staff, so only the null ones are offered in 'Ders nazırı ata'.",
  })
  madrasahName!: string | null;
}

export class KoskGrantResponse {
  @ApiProperty({
    format: "uuid",
    description: "The ders nazırı post; `PATCH` and `DELETE` address it",
  })
  id!: string;

  @ApiProperty({ type: KoskPersonResponse })
  user!: KoskPersonResponse;

  @ApiProperty({ type: KoskGrantCourseResponse })
  course!: KoskGrantCourseResponse;

  @ApiProperty({
    type: [String],
    description: "Course permission codes the person holds in the course now",
  })
  permissions!: string[];

  @ApiPropertyOptional({
    type: Date,
    nullable: true,
    description:
      "When the post and its permissions end, on the same day; null means until they are taken away",
  })
  endsAt!: Date | null;

  @ApiProperty({ type: KoskPersonResponse })
  grantedBy!: KoskPersonResponse;

  @ApiProperty({ type: Date })
  grantedAt!: Date;
}

export class KoskGrantsResponse {
  @ApiProperty({
    type: KoskGrantResponse,
    isArray: true,
    description:
      "The ders nazırları of the köşk's medrese-free courses, oldest post first",
  })
  items!: KoskGrantResponse[];

  @ApiProperty({
    type: KoskGrantCourseResponse,
    isArray: true,
    description:
      "Every course of the köşk that is not hidden: the ones a post can be made in, and the medrese ones the page names",
  })
  courses!: KoskGrantCourseResponse[];

  @ApiProperty({
    type: [String],
    description:
      "The permission codes the caller may hand out, in the order the dialog draws them",
  })
  grantable!: string[];
}

export class CreateKoskGrantDto {
  @ApiProperty({
    format: "uuid",
    description: "The account that becomes a ders nazırı (`GET /users/lookup`)",
  })
  @IsUUID()
  userId!: string;

  @ApiProperty({ format: "uuid", description: "A medrese-free course" })
  @IsUUID()
  courseId!: string;

  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: MAX_PERMISSIONS,
    description:
      "Course permission codes; none the caller does not hold themselves (403 GRANT_EXCEEDS_GIVER)",
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PERMISSIONS)
  @IsString({ each: true })
  permissions!: string[];

  @ApiPropertyOptional({
    type: String,
    format: "date-time",
    description:
      "The post and its permissions end together. Omitted: until taken away. In the past: 400.",
  })
  @IsOptional()
  @IsISO8601()
  endsAt?: string;
}

export class UpdateKoskGrantDto {
  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: MAX_PERMISSIONS,
    description: "The whole set the person holds from now on",
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PERMISSIONS)
  @IsString({ each: true })
  permissions!: string[];

  @ApiPropertyOptional({
    type: String,
    format: "date-time",
    nullable: true,
    description: "The new end; null (or omitted) means until taken away",
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsISO8601()
  endsAt?: string | null;
}
