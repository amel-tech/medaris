import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { ObjectStorage } from "./object-storage";
import { StorageDeletionService } from "./storage-deletion.service";
import { enqueueStorageDeletions, reserveUpload } from "./storage-deletions";
import type { IStoredFile } from "./stored-file";
import type { IAcceptedFile } from "./upload";

/**
 * Puts an accepted upload in storage and has the caller record it (MDRS-287,
 * MDRS-290), in an order that never leaves an object nobody points at:
 *
 * 1. a `storage_deletions` row for the key, due an hour ahead (`reserveUpload`);
 * 2. the object, under a key tedrisat built (`storage-keys.ts`);
 * 3. `record`, whose transaction writes the row that points at the object and
 *    deletes the reservation (`claimUpload`) — or throws.
 *
 * If the store or `record` fails, the key is due for removal at once and the
 * sweep is kicked; if the process dies in between, the reservation falls due
 * within the hour. Either way the caller's error is what the client gets.
 */
@Injectable()
export class UploadStore {
  // All three must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: ObjectStorage,
    private readonly deletions: StorageDeletionService
  ) {}

  async store<T>(
    key: string,
    file: IAcceptedFile,
    record: (stored: IStoredFile) => Promise<T>
  ): Promise<T> {
    this.storage.assertConfigured();
    await reserveUpload(this.database.db, key);
    try {
      await this.storage.put(key, file.body, file.contentType);
      return await record({
        storageKey: key,
        fileName: file.fileName,
        contentType: file.contentType,
        sizeBytes: file.size,
      });
    } catch (error) {
      await enqueueStorageDeletions(this.database.db, [key], "upload.failed");
      this.deletions.kick();
      throw error;
    }
  }
}
