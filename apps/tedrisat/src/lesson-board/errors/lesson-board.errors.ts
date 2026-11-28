import { BadRequestError, ErrorContext, NotFoundError } from "@medaris/common";

export class LessonBoardSceneInvalidError extends BadRequestError {
  static readonly code = "LESSON_BOARD_SCENE_INVALID";

  constructor(reason: string, context?: ErrorContext) {
    super(
      LessonBoardSceneInvalidError.code,
      `The board could not be read: ${reason}`,
      context
    );
  }
}

export class LessonBoardFileNotFoundError extends NotFoundError {
  static readonly code = "LESSON_BOARD_FILE_NOT_FOUND";

  constructor(fileKey: string, context?: ErrorContext) {
    super(
      LessonBoardFileNotFoundError.code,
      `Board image ${fileKey} not found`,
      context
    );
  }
}

export class LessonBoardFileKeyInvalidError extends BadRequestError {
  static readonly code = "LESSON_BOARD_FILE_KEY_INVALID";

  constructor(context?: ErrorContext) {
    super(
      LessonBoardFileKeyInvalidError.code,
      "A board image needs the id the canvas gave it (`fileKey`): letters, digits, - and _, at most 64",
      context
    );
  }
}

export class LessonBoardFilesFullError extends BadRequestError {
  static readonly code = "LESSON_BOARD_FILES_FULL";

  constructor(max: number, context?: ErrorContext) {
    super(
      LessonBoardFilesFullError.code,
      `A board holds at most ${max} images`,
      context
    );
  }
}
