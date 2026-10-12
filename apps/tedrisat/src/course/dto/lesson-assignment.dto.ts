import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsOptional, IsString, MaxLength } from "class-validator";

/** The longest homework description, in characters, as long as a talebe's note on it. */
export const ASSIGNMENT_DESCRIPTION_MAX = 4000;

export class SaveLessonAssignmentDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: "Birinci babın çekimlerini yazın, fotoğrafını yükleyin.",
    description: `What the talebe are to do, plain text with line breaks, at most ${ASSIGNMENT_DESCRIPTION_MAX} characters after trimming; null, absent or blank is none. Stored as typed and never rendered as HTML.`,
  })
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim() || null : value
  )
  @IsOptional()
  @IsString()
  @MaxLength(ASSIGNMENT_DESCRIPTION_MAX)
  description?: string | null;
}

/** A file of a celse's homework. */
export class LessonAssignmentFileResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({
    example: "Ödev yönergesi.pdf",
    description:
      "The sanitised name it was uploaded under; its download is saved as this.",
  })
  name!: string;
  @ApiProperty({
    example: "application/pdf",
    description: "The type read from the file's bytes at upload.",
  })
  contentType!: string;
  @ApiProperty({ example: 482133 }) sizeBytes!: number;
  @ApiProperty({ type: Date }) createdAt!: Date;
  @ApiProperty({
    example:
      "/lessons/0b9c1e52-1111-4a5e-9d55-6b1f0c2a7e01/assignment/files/5d6e7f80-2222-4b3c-8d9e-0a1b2c3d4e5f",
    description:
      "tedrisat's download route for it, a path from the API's root (`GET /lessons/:id/assignment/files/:fileId`). It needs the caller's own token and answers only a reader of the course's content.",
  })
  downloadUrl!: string;
}

/**
 * The homework a müderris set on a celse: its description and its own files,
 * apart from the celse's resources.
 */
export class LessonAssignmentResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "uuid" }) lessonId!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: "Plain text as typed; null when there is none.",
  })
  description!: string | null;
  @ApiProperty({
    type: [LessonAssignmentFileResponse],
    description: "Oldest first.",
  })
  files!: LessonAssignmentFileResponse[];
  @ApiProperty({ type: Date }) createdAt!: Date;
  @ApiProperty({
    type: Date,
    description:
      "When the course team last changed it: the description, or a file added or removed.",
  })
  updatedAt!: Date;
}
