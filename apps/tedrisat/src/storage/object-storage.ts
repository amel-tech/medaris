import type { Readable } from "node:stream";
import { MedarisError } from "@medaris/common";

export class StorageNotConfiguredError extends MedarisError {
  static readonly code = "STORAGE_NOT_CONFIGURED";

  constructor() {
    super(
      StorageNotConfiguredError.code,
      503,
      "File storage is not available: the BUNNY_STORAGE_* keys are not set on this server"
    );
  }
}

export class StorageUnavailableError extends MedarisError {
  static readonly code = "STORAGE_UNAVAILABLE";

  constructor(cause?: unknown) {
    super(
      StorageUnavailableError.code,
      503,
      "File storage did not answer",
      undefined,
      cause === undefined ? undefined : { cause }
    );
  }
}

/** An object as `get` hands it out: its bytes as a stream, and their count when the store said. */
export interface IStoredObject {
  body: Readable;
  size: number | null;
}

/**
 * Where uploaded files live (MDRS-287, MDRS-290): Bunny Storage through its
 * S3-compatible API in a deployment (`BunnyObjectStorage`), an in-memory map
 * in the specs, which may not reach the network (MDRS-89). Everything about
 * the store — its address, its keys, its credentials — stays behind this
 * class; callers hand it a key tedrisat built (`storage-keys.ts`) and get
 * bytes back, never a URL a browser could open.
 */
export abstract class ObjectStorage {
  /** Whether the store is set up; when not, every call below throws 503. */
  abstract isConfigured(): boolean;

  /**
   * The first segment of every key this environment writes (`local-dev`,
   * `prod`). Throws 503 when the store is not configured.
   */
  abstract keyPrefix(): string;

  /** Stores `body` under `key`, replacing whatever was there. */
  abstract put(key: string, body: Buffer, contentType: string): Promise<void>;

  /** The object's bytes, or null when the store has no such key. */
  abstract get(key: string): Promise<IStoredObject | null>;

  /** The object's size, or null when the store has no such key. */
  abstract head(key: string): Promise<{ size: number | null } | null>;

  /** Removes the object; a key that is already gone is not an error. */
  abstract delete(key: string): Promise<void>;

  /** Throws 503 STORAGE_NOT_CONFIGURED when the store is not set up. */
  assertConfigured(): void {
    if (!this.isConfigured()) throw new StorageNotConfiguredError();
  }
}
