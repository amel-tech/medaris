import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  OnModuleDestroy,
} from "@nestjs/common";
import { eq, inArray, lte, sql } from "drizzle-orm";
import { isTestRunner } from "../config/security-env";
import { DatabaseService } from "../database/database.service";
import { storageDeletions } from "../database/schema/storage.schema";
import { ObjectStorage } from "./object-storage";

/** How often the sweep runs on its own, besides the writes that kick it. */
export const STORAGE_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
/** Rows claimed per pass; a full batch makes the run go round again. */
const BATCH = 50;
/** Passes one kick may take, so a store that keeps failing never spins the sweep. */
const MAX_ROUNDS_PER_RUN = 20;
/** The longest wait between two tries of one object. */
const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000;

/**
 * Removes from the store the objects `storage_deletions` lists (MDRS-287).
 *
 * The rows are written by the transactions that drop a file's last reference,
 * so the database decides what is gone and this only catches the store up:
 * a purge, a removed resource or a deleted homework file never waits on the
 * store and never fails because of it. `kick()` runs a pass soon; the writes
 * that let a file go call it once they have committed. The timer runs a pass
 * every five minutes for what a kick missed and to retry what the store
 * refused: each failure is kept on its row (`attempts`, `last_error`) and
 * tried again later, at most six hours apart.
 *
 * Several tedrisat instances sweeping at once is harmless: a pass claims its
 * rows with `FOR UPDATE SKIP LOCKED` by moving them ahead, and removing an
 * object twice is not an error. Without storage nothing runs and the rows
 * wait. Under the test runner no timer runs; a spec kicks and waits with
 * `whenIdle()`.
 */
@Injectable()
export class StorageDeletionService
  implements OnApplicationBootstrap, OnModuleDestroy, OnApplicationShutdown
{
  private readonly logger = new Logger(StorageDeletionService.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private again = false;
  private stopping = false;

  // Both must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: ObjectStorage
  ) {}

  onApplicationBootstrap(): void {
    if (!this.storage.isConfigured() || isTestRunner()) return;
    this.timer = setInterval(() => this.kick(), STORAGE_SWEEP_INTERVAL_MS);
    this.timer.unref();
    this.kick();
  }

  /** A pass in flight finishes before the database goes away. */
  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.whenIdle();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Runs a pass soon, without waiting for it. A kick during a run makes the
   * run go round once more instead of starting a second one beside it.
   */
  kick(): void {
    if (!this.storage.isConfigured() || this.stopping) return;
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = this.run().finally(() => {
      this.running = null;
    });
  }

  /** Resolves once no run is in flight. */
  async whenIdle(): Promise<void> {
    while (this.running) await this.running;
  }

  private async run(): Promise<void> {
    // Off the caller's stack: the write that kicked has answered first.
    await new Promise((resolve) => setImmediate(resolve));
    for (let round = 0; round < MAX_ROUNDS_PER_RUN; round++) {
      this.again = false;
      let claimed: number;
      try {
        claimed = await this.pass();
      } catch (error) {
        this.logger.error(
          `Storage deletion pass failed: ${error instanceof Error ? error.message : String(error)}`
        );
        return;
      }
      if (this.stopping) return;
      if (claimed < BATCH && !this.again) return;
    }
  }

  /** Claims the rows that are due, removes their objects and returns how many it claimed. */
  async pass(): Promise<number> {
    const db = this.database.db;
    const due = db
      .select({ key: storageDeletions.storageKey })
      .from(storageDeletions)
      .where(lte(storageDeletions.dueAt, sql`now()`))
      .orderBy(storageDeletions.dueAt)
      .limit(BATCH)
      .for("update", { skipLocked: true });
    const claimed = await db
      .update(storageDeletions)
      .set({
        // Out of every other pass's way while this one works on it.
        dueAt: sql`now() + interval '15 minutes'`,
        attempts: sql`${storageDeletions.attempts} + 1`,
      })
      .where(inArray(storageDeletions.storageKey, due))
      .returning({
        key: storageDeletions.storageKey,
        attempts: storageDeletions.attempts,
      });
    const removed: string[] = [];
    for (const { key, attempts } of claimed) {
      try {
        await this.storage.delete(key);
        removed.push(key);
      } catch (error) {
        const message =
          error instanceof Error ? `${error.name}: ${error.message}` : "error";
        this.logger.warn(
          `Could not remove a stored file (attempt ${attempts}): ${message}`
        );
        await db
          .update(storageDeletions)
          .set({
            lastError: message.slice(0, 500),
            dueAt: new Date(Date.now() + backoffMs(attempts)),
          })
          .where(eq(storageDeletions.storageKey, key));
      }
    }
    if (removed.length > 0) {
      await db
        .delete(storageDeletions)
        .where(inArray(storageDeletions.storageKey, removed));
    }
    return claimed.length;
  }
}

/** One minute after the first failure, doubling, at most six hours. */
export function backoffMs(attempts: number): number {
  return Math.min(60_000 * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}
