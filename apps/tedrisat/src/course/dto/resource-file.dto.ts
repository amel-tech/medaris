import {
  type ApiBodyOptions,
  ApiProperty,
  ApiPropertyOptional,
} from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsOptional, IsString, MaxLength } from "class-validator";
import {
  LessonResourceResponse,
  ResourceResponse,
} from "./course-response.dto";

const trimmedOrNull = ({ value }: { value: unknown }): unknown =>
  typeof value === "string" ? value.trim() || null : value;

/**
 * The text fields sent with a resource's file (MDRS-287), beside the
 * multipart field `file`. Both are optional: the name defaults to the file's
 * own name without its extension.
 */
export class UploadResourceFileDto {
  @ApiPropertyOptional({
    example: "Emsile şerhi",
    description:
      "The name the resource is listed under, at most 200 characters; the file's own name without its extension when absent or blank.",
  })
  @Transform(trimmedOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string | null;

  @ApiPropertyOptional({
    example: "PDF · 12 sayfa",
    description: "A short line under the name, at most 120 characters.",
  })
  @Transform(trimmedOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  meta?: string | null;
}

/** The multipart body of both upload routes, for the API document. */
export const RESOURCE_FILE_UPLOAD_BODY: ApiBodyOptions = {
  schema: {
    type: "object",
    properties: {
      file: {
        type: "string",
        format: "binary",
        description:
          "At most 25 MB; PDF, PNG, JPEG, WebP, docx, xlsx, pptx or plain UTF-8 text, as read from its bytes.",
      },
      name: { type: "string", maxLength: 200 },
      meta: { type: "string", maxLength: 120 },
    },
    required: ["file"],
  },
};

export class CourseResourceFileUploadResponse {
  @ApiProperty({
    type: () => ResourceResponse,
    description:
      "The new resource, last in the course's list, with its `file`. Keep it in an editor's list: a whole-course save that leaves it out removes it, file and all.",
  })
  resource!: ResourceResponse;
  @ApiProperty({
    description:
      "The course's version after the upload, which bumps it; send it with the next save.",
  })
  courseVersion!: number;
}

export class LessonResourceFileUploadResponse {
  @ApiProperty({
    type: () => LessonResourceResponse,
    description:
      "The new resource, last in the session's list, with its `file`. Keep it in an editor's list: a save of the session's resources that leaves it out removes it, file and all.",
  })
  resource!: LessonResourceResponse;
  @ApiProperty({
    description:
      "The course's version after the upload, which bumps it; send it with the next save.",
  })
  courseVersion!: number;
}
