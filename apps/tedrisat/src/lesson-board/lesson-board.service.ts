import type { AuthenticatedUser } from "@medaris/common";
import { Injectable, type StreamableFile } from "@nestjs/common";
import type { Response } from "express";
import { CourseService } from "../course/course.service";
import { ObjectStorage } from "../storage/object-storage";
import { StorageDeletionService } from "../storage/storage-deletion.service";
import { lessonBoardFileKey } from "../storage/storage-keys";
import { streamStoredFile } from "../storage/stored-file";
import { acceptUpload, FileTypeNotAllowedError } from "../storage/upload";
import { UploadStore } from "../storage/upload-store";
import {
  BOARD_FILE_KEY,
  BOARD_FILES_MAX,
  BOARD_SCENE_MAX_BYTES,
} from "./dto/lesson-board.dto";
import {
  LessonBoardFileKeyInvalidError,
  LessonBoardFileNotFoundError,
  LessonBoardFilesFullError,
  LessonBoardSceneInvalidError,
} from "./errors/lesson-board.errors";
import {
  type IBoardFile,
  type ILessonBoard,
  LessonBoardRepository,
} from "./lesson-board.repository";
import { readBoardScene, sceneFileKeys } from "./lesson-board.scene";

@Injectable()
export class LessonBoardService {
  constructor(
    private readonly courses: CourseService,
    private readonly boards: LessonBoardRepository,
    private readonly storage: ObjectStorage,
    private readonly uploads: UploadStore,
    private readonly deletions: StorageDeletionService
  ) {}

  /** For whoever reads the course's content; a hidden course's session is not found. */
  async read(lessonId: string, user: AuthenticatedUser): Promise<ILessonBoard> {
    await this.courses.findVisibleLessonCourse(lessonId, user);
    return this.boards.find(lessonId);
  }

  /**
   * Saves the scene sent as the multipart field `file`. An image the scene
   * shows must already be a file of this board: a scene that names one that
   * is not would leave the talebe a hole.
   */
  async save(
    lessonId: string,
    user: AuthenticatedUser,
    file: Express.Multer.File | undefined
  ): Promise<ILessonBoard> {
    await this.courses.findWritableLessonCourse(lessonId, user);
    if (!file?.buffer || file.size === 0) {
      throw new LessonBoardSceneInvalidError("no scene was sent");
    }
    if (file.size > BOARD_SCENE_MAX_BYTES) {
      throw new LessonBoardSceneInvalidError("the scene is too large");
    }
    const scene = readBoardScene(file.buffer.toString("utf8"));
    const shown = sceneFileKeys(scene);
    for (const fileKey of shown) {
      if (!(await this.boards.hasFile(lessonId, fileKey))) {
        throw new LessonBoardSceneInvalidError(
          `image ${fileKey} was not uploaded`
        );
      }
    }
    await this.boards.save(lessonId, user.sub, scene, shown);
    this.deletions.kick();
    return this.boards.find(lessonId);
  }

  /** Stores an image of the board under the id the canvas gave it. */
  async addFile(
    lessonId: string,
    user: AuthenticatedUser,
    fileKey: unknown,
    file: Express.Multer.File | undefined
  ): Promise<IBoardFile> {
    this.storage.assertConfigured();
    const courseId = await this.courses.findWritableLessonCourse(
      lessonId,
      user
    );
    if (typeof fileKey !== "string" || !BOARD_FILE_KEY.test(fileKey)) {
      throw new LessonBoardFileKeyInvalidError();
    }
    const accepted = acceptUpload(file);
    // A board takes pictures only; a PDF or a document is a session resource.
    if (!accepted.contentType.startsWith("image/")) {
      throw new FileTypeNotAllowedError();
    }
    // The canvas names an image by its content: the same picture pasted
    // twice is the same key, already stored.
    const [existing] = (await this.boards.find(lessonId)).files.filter(
      (candidate) => candidate.fileKey === fileKey
    );
    if (existing) return existing;
    if ((await this.boards.countFiles(lessonId)) >= BOARD_FILES_MAX) {
      throw new LessonBoardFilesFullError(BOARD_FILES_MAX);
    }
    return this.uploads.store(
      lessonBoardFileKey(this.storage.keyPrefix(), courseId, lessonId),
      accepted,
      (stored) => this.boards.addFile(lessonId, user.sub, fileKey, stored)
    );
  }

  async download(
    lessonId: string,
    fileKey: string,
    user: AuthenticatedUser,
    response: Response
  ): Promise<StreamableFile> {
    this.storage.assertConfigured();
    await this.courses.findVisibleLessonCourse(lessonId, user);
    const file = BOARD_FILE_KEY.test(fileKey)
      ? await this.boards.findFile(lessonId, fileKey)
      : null;
    if (!file) throw new LessonBoardFileNotFoundError(fileKey);
    return streamStoredFile(
      this.storage,
      file,
      response,
      () => new LessonBoardFileNotFoundError(fileKey)
    );
  }
}
