import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { RecordingVisibility } from "../domain/recording";

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

/** `POST /lessons/:id/recordings/uploads` (MDRS-116). The file itself never comes here. */
export class StartRecordingUploadDto {
  @ApiProperty({
    example: "Emsile: 3. celse kaydı",
    maxLength: 200,
    description:
      "The recording's title, shown on the course page and given to Bunny as the video's title.",
  })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({
    enum: RecordingVisibility,
    enumName: "RecordingVisibility",
    default: RecordingVisibility.ENROLLED,
    description:
      "ENROLLED (the default) shows it only to those who may read the course's content; PUBLIC to everyone, unless the course is closed or a policy keeps recordings from the public.",
  })
  @IsOptional()
  @IsEnum(RecordingVisibility)
  visibility?: RecordingVisibility;

  @ApiPropertyOptional({ example: "2026-10-03T18:00:00.000Z" })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  recordedAt?: Date;
}

/**
 * What the browser needs for Bunny's TUS upload (MDRS-116). Send
 * `authorizationSignature`, `authorizationExpire`, `videoId` and `libraryId`
 * as the `AuthorizationSignature`, `AuthorizationExpire`, `VideoId` and
 * `LibraryId` headers to `endpoint`, with `filetype` and `title` as TUS
 * metadata. The library's API key is never sent.
 */
export class RecordingUploadResponse {
  @ApiProperty({
    format: "uuid",
    description: "The recording row this upload fills.",
  })
  recordingId!: string;

  @ApiProperty({ example: "https://video.bunnycdn.com/tusupload" })
  endpoint!: string;

  @ApiProperty({ example: "123456" })
  libraryId!: string;

  @ApiProperty({
    description: "Bunny's id of the video, the same on every re-sign.",
  })
  videoId!: string;

  @ApiProperty({
    description:
      "Unix seconds. The end of the upload's lifetime: 24 hours after it was started, and never moved by a re-sign.",
  })
  authorizationExpire!: number;

  @ApiProperty({
    description: "SHA256_HEX(library_id + api_key + expiration + video_id).",
  })
  authorizationSignature!: string;
}
