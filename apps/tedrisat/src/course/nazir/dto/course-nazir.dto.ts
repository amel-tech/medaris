import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from "class-validator";
import { KoskPersonResponse } from "../../../kosk/dto/kosk-admin.dto";

/** More than the course catalog can ever hold; a longer list is nonsense. */
const MAX_PERMISSIONS = 40;

export class CourseNazirCourseResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "Emsile ve Bina" })
  title!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "The medrese the course is the work of; null for a köşk's own",
  })
  madrasahName!: string | null;
}

export class CourseNazirResponse {
  @ApiProperty({
    format: "uuid",
    description: "The ders nazırı post; `PATCH` and `DELETE` address it",
  })
  id!: string;

  @ApiProperty({ type: KoskPersonResponse })
  user!: KoskPersonResponse;

  @ApiProperty({
    type: [String],
    description:
      "Course permission codes the person holds in the course now, in the catalog's order",
  })
  permissions!: string[];

  @ApiPropertyOptional({
    type: Date,
    nullable: true,
    description:
      "When the post and its permissions end, at the same instant; null means until they are taken away",
  })
  endsAt!: Date | null;

  @ApiProperty({
    type: KoskPersonResponse,
    description: "Who appointed the person",
  })
  grantedBy!: KoskPersonResponse;

  @ApiProperty({ type: Date })
  grantedAt!: Date;

  @ApiProperty({
    description:
      "Whether the caller may change this post's permissions and end: a giver, never on their own post (the başnazım excepted)",
  })
  mayEdit!: boolean;

  @ApiProperty({
    description:
      "Whether the caller may end this post: a giver ends any, an appointer only the ones they appointed",
  })
  mayEnd!: boolean;
}

export class CourseNazirsResponse {
  @ApiProperty({ type: CourseNazirCourseResponse })
  course!: CourseNazirCourseResponse;

  @ApiProperty({
    type: CourseNazirResponse,
    isArray: true,
    description: "The ders nazırları of the course, oldest post first",
  })
  items!: CourseNazirResponse[];

  @ApiProperty({
    type: [String],
    description:
      "Every code a ders nazırı can be given in a course, in the order the dialog draws them",
  })
  catalog!: string[];

  @ApiProperty({
    type: [String],
    description:
      "The codes the caller may hand out here, in the catalog's order; empty for one who appoints only",
  })
  grantable!: string[];

  @ApiProperty({
    description:
      "Whether the caller may appoint a ders nazırı in this course now",
  })
  mayAppoint!: boolean;
}

export class CreateCourseNazirDto {
  @ApiProperty({
    format: "uuid",
    description: "The account that becomes a ders nazırı (`GET /users/lookup`)",
  })
  @IsUUID()
  userId!: string;

  @ApiProperty({
    type: [String],
    maxItems: MAX_PERMISSIONS,
    description:
      "Course permission codes; none the caller does not hold themselves (403 GRANT_EXCEEDS_GIVER). Empty appoints with no permission, all one who appoints only may send",
  })
  @IsArray()
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
  @IsISO8601({ strict: true })
  endsAt?: string;
}

export class UpdateCourseNazirDto {
  @ApiProperty({
    type: [String],
    maxItems: MAX_PERMISSIONS,
    description: "The whole set the person holds from now on",
  })
  @IsArray()
  @ArrayMaxSize(MAX_PERMISSIONS)
  @IsString({ each: true })
  permissions!: string[];

  @ApiProperty({
    type: String,
    format: "date-time",
    nullable: true,
    description:
      "The new end; null means until taken away. Required, so an edit that leaves it out cannot lift an end by accident.",
  })
  @ValidateIf((_, value) => value !== null)
  @IsISO8601({ strict: true })
  endsAt!: string | null;
}
