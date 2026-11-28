import { Injectable } from "@nestjs/common";
import { and, asc, count, eq, notInArray } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import {
  lessonBoardFiles,
  lessonBoards,
} from "../database/schema/lesson-board.schema";
import { enqueueStorageDeletions } from "../storage/storage-deletions";
import type { IStoredFile } from "../storage/stored-file";
import type { IBoardScene } from "./lesson-board.scene";

export interface IBoardFile {
  fileKey: string;
  contentType: string;
  sizeBytes: number;
}

export interface ILessonBoard {
  lessonId: string;
  scene: IBoardScene | null;
  files: IBoardFile[];
  updatedAt: Date | null;
}

const fileColumns = {
  fileKey: lessonBoardFiles.fileKey,
  contentType: lessonBoardFiles.contentType,
  sizeBytes: lessonBoardFiles.sizeBytes,
};

@Injectable()
export class LessonBoardRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /** The board as it stands; a session with none reads as an empty one. */
  async find(lessonId: string): Promise<ILessonBoard> {
    const [[board], files] = await Promise.all([
      this.db
        .select({
          scene: lessonBoards.scene,
          updatedAt: lessonBoards.updatedAt,
        })
        .from(lessonBoards)
        .where(eq(lessonBoards.lessonId, lessonId))
        .limit(1),
      this.db
        .select(fileColumns)
        .from(lessonBoardFiles)
        .where(eq(lessonBoardFiles.lessonId, lessonId))
        .orderBy(asc(lessonBoardFiles.createdAt), asc(lessonBoardFiles.id)),
    ]);
    return {
      lessonId,
      scene: (board?.scene as IBoardScene | undefined) ?? null,
      files,
      updatedAt: board?.updatedAt ?? null,
    };
  }

  /**
   * Saves the scene over the one before it and, in the same transaction,
   * removes the board's files the scene no longer shows, marking each one's
   * object for removal from storage once this commits.
   */
  async save(
    lessonId: string,
    userId: string,
    scene: IBoardScene,
    shownFileKeys: readonly string[]
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const now = new Date();
      await tx
        .insert(lessonBoards)
        .values({ lessonId, scene, updatedBy: userId })
        .onConflictDoUpdate({
          target: lessonBoards.lessonId,
          set: { scene, updatedBy: userId, updatedAt: now },
        });
      const dropped = await tx
        .delete(lessonBoardFiles)
        .where(
          shownFileKeys.length > 0
            ? and(
                eq(lessonBoardFiles.lessonId, lessonId),
                notInArray(lessonBoardFiles.fileKey, [...shownFileKeys])
              )
            : eq(lessonBoardFiles.lessonId, lessonId)
        )
        .returning({ key: lessonBoardFiles.storageKey });
      await enqueueStorageDeletions(
        tx,
        dropped.map((file) => file.key),
        "board.file_delete"
      );
    });
  }

  async countFiles(lessonId: string): Promise<number> {
    const [row] = await this.db
      .select({ files: count() })
      .from(lessonBoardFiles)
      .where(eq(lessonBoardFiles.lessonId, lessonId));
    return row?.files ?? 0;
  }

  async hasFile(lessonId: string, fileKey: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: lessonBoardFiles.id })
      .from(lessonBoardFiles)
      .where(
        and(
          eq(lessonBoardFiles.lessonId, lessonId),
          eq(lessonBoardFiles.fileKey, fileKey)
        )
      )
      .limit(1);
    return row !== undefined;
  }

  /** Records a stored image. Throws on a key the board already has. */
  async addFile(
    lessonId: string,
    userId: string,
    fileKey: string,
    stored: IStoredFile
  ): Promise<IBoardFile> {
    const [row] = await this.db
      .insert(lessonBoardFiles)
      .values({
        lessonId,
        fileKey,
        uploadedBy: userId,
        storageKey: stored.storageKey,
        fileName: stored.fileName,
        contentType: stored.contentType,
        sizeBytes: stored.sizeBytes,
      })
      .returning(fileColumns);
    return row;
  }

  async findFile(
    lessonId: string,
    fileKey: string
  ): Promise<IStoredFile | null> {
    const [row] = await this.db
      .select({
        storageKey: lessonBoardFiles.storageKey,
        fileName: lessonBoardFiles.fileName,
        contentType: lessonBoardFiles.contentType,
        sizeBytes: lessonBoardFiles.sizeBytes,
      })
      .from(lessonBoardFiles)
      .where(
        and(
          eq(lessonBoardFiles.lessonId, lessonId),
          eq(lessonBoardFiles.fileKey, fileKey)
        )
      )
      .limit(1);
    return row ?? null;
  }
}
