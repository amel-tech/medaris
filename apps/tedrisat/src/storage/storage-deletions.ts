import { inArray, sql } from "drizzle-orm";
import type { DatabaseService } from "../database/database.service";
import { storageDeletions } from "../database/schema/storage.schema";

type Db = DatabaseService["db"];
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** The database or a transaction on it: the rows below are written in the caller's. */
export type StorageWriter = Db | Tx;

/** Why an object was let go, as `storage_deletions.reason` records it. */
export type DeletionReason =
  | "resource.remove"
  | "course.purge"
  | "lesson.purge"
  | "submission.file_delete"
  | "upload.failed"
  | "upload.unclaimed";

/** How long an upload has to record the object it stored before the object counts as orphaned. */
export const UPLOAD_CLAIM_WINDOW_MS = 60 * 60 * 1000;

/**
 * Marks objects for removal from the store, inside the caller's transaction
 * (MDRS-287): the row and the delete of the last reference to the object
 * commit or roll back together. `StorageDeletionService` removes them.
 */
export async function enqueueStorageDeletions(
  db: StorageWriter,
  keys: readonly (string | null)[],
  reason: DeletionReason
): Promise<void> {
  const unique = [...new Set(keys.filter((k): k is string => Boolean(k)))];
  if (unique.length === 0) return;
  await db
    .insert(storageDeletions)
    .values(unique.map((storageKey) => ({ storageKey, reason })))
    .onConflictDoUpdate({
      target: storageDeletions.storageKey,
      set: { reason, dueAt: sql`now()` },
    });
}

/**
 * Before an object is stored: a row that removes it an hour from now unless
 * the upload's own transaction claims it (`claimUpload`). A process that dies
 * between the store and the database leaves no file behind for good.
 */
export async function reserveUpload(
  db: StorageWriter,
  key: string
): Promise<void> {
  await db.insert(storageDeletions).values({
    storageKey: key,
    reason: "upload.unclaimed",
    dueAt: new Date(Date.now() + UPLOAD_CLAIM_WINDOW_MS),
  });
}

/** In the transaction that records the stored object: it is no longer to be removed. */
export async function claimUpload(
  db: StorageWriter,
  key: string
): Promise<void> {
  await db
    .delete(storageDeletions)
    .where(inArray(storageDeletions.storageKey, [key]));
}
