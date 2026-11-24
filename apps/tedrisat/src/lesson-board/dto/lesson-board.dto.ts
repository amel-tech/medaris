import { ApiProperty } from "@nestjs/swagger";

/** The largest scene a board may be saved as, in bytes of its JSON. */
export const BOARD_SCENE_MAX_BYTES = 4 * 1024 * 1024;

/** The most elements a board may hold. */
export const BOARD_ELEMENTS_MAX = 5000;

/** The most images a board may hold. */
export const BOARD_FILES_MAX = 60;

/** The id the canvas gives an image: letters, digits, `-` and `_`. */
export const BOARD_FILE_KEY = /^[A-Za-z0-9_-]{1,64}$/;

export class LessonBoardFileResponse {
  @ApiProperty({
    example: "3f1c9a",
    description:
      "The id the canvas gave the image; an image element of the scene names it as its `fileId`.",
  })
  fileKey!: string;

  @ApiProperty({ example: "image/png" })
  contentType!: string;

  @ApiProperty()
  sizeBytes!: number;
}

export class LessonBoardResponse {
  @ApiProperty({ format: "uuid" })
  lessonId!: string;

  @ApiProperty({
    type: Object,
    nullable: true,
    description:
      "The canvas document (`{ elements, appState }`) as it was saved; null when the session has no board yet. Its images are not inside it: each is in `files`, fetched by its `fileKey`.",
  })
  scene!: object | null;

  @ApiProperty({ type: [LessonBoardFileResponse] })
  files!: LessonBoardFileResponse[];

  @ApiProperty({ type: Date, nullable: true })
  updatedAt!: Date | null;
}
