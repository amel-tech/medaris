import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { IBunnyStorageConfig } from "../config/bunny-storage-env";
import {
  type IStoredObject,
  ObjectStorage,
  StorageNotConfiguredError,
  StorageUnavailableError,
} from "./object-storage";
import {
  EMPTY_PAYLOAD_SHA256,
  objectPath,
  sha256Hex,
  signS3Request,
} from "./s3-signature";

/** The zone config, or null when unset (`readBunnyStorageConfig`). Overridable in tests. */
export const BUNNY_STORAGE_CONFIG = Symbol("BUNNY_STORAGE_CONFIG");
/** The transport the client calls Bunny with. Overridable in tests, which may not reach the network (MDRS-89). */
export const BUNNY_STORAGE_FETCH = Symbol("BUNNY_STORAGE_FETCH");
export type StorageFetch = typeof fetch;

/** A 25 MB upload over a slow link to the zone still finishes well inside this. */
const PUT_TIMEOUT_MS = 120_000;
/** Until the store answers with headers; the body then streams for as long as the reader takes. */
const RESPONSE_TIMEOUT_MS = 30_000;

/**
 * Bunny Storage through its S3-compatible API (MDRS-287): path-style
 * requests to the zone's regional endpoint (`https://<region>-s3.storage.bunnycdn.com/<zone>/<key>`),
 * signed with Signature Version 4 for the zone's region, the zone's name as
 * the access key id and its password as the secret
 * (https://docs.bunny.net/storage/s3). Only PutObject, GetObject, HeadObject
 * and DeleteObject are used, all of which Bunny lists as supported; nothing
 * relies on `x-amz-meta-*`, which it does not keep, so a file's name and type
 * live in the database.
 *
 * Failures are logged with the verb and the status only — never a key's
 * owner, never a credential — and reach the caller as 503 STORAGE_UNAVAILABLE.
 */
@Injectable()
export class BunnyObjectStorage extends ObjectStorage {
  private readonly logger = new Logger(BunnyObjectStorage.name);

  constructor(
    @Inject(BUNNY_STORAGE_CONFIG)
    private readonly config: IBunnyStorageConfig | null,
    @Inject(BUNNY_STORAGE_FETCH) private readonly fetchImpl: StorageFetch
  ) {
    super();
  }

  isConfigured(): boolean {
    return this.config !== null;
  }

  keyPrefix(): string {
    return this.settings.keyPrefix;
  }

  private get settings(): IBunnyStorageConfig {
    if (!this.config) throw new StorageNotConfiguredError();
    return this.config;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const response = await this.send("PUT", key, {
      body,
      headers: { "content-type": contentType },
      timeoutMs: PUT_TIMEOUT_MS,
    });
    await response.body?.cancel();
    if (!response.ok) this.fail("PUT", response.status);
  }

  async get(key: string): Promise<IStoredObject | null> {
    const response = await this.send("GET", key, {
      timeoutMs: RESPONSE_TIMEOUT_MS,
    });
    if (response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      this.fail("GET", response.status);
    }
    return {
      body: Readable.fromWeb(response.body as WebReadableStream<Uint8Array>),
      size: lengthOf(response),
    };
  }

  async head(key: string): Promise<{ size: number | null } | null> {
    const response = await this.send("HEAD", key, {
      timeoutMs: RESPONSE_TIMEOUT_MS,
    });
    await response.body?.cancel();
    if (response.status === 404) return null;
    if (!response.ok) this.fail("HEAD", response.status);
    return { size: lengthOf(response) };
  }

  async delete(key: string): Promise<void> {
    const response = await this.send("DELETE", key, {
      timeoutMs: RESPONSE_TIMEOUT_MS,
    });
    await response.body?.cancel();
    // S3 answers 204 for a key that was never there; a 404 means the same.
    if (!response.ok && response.status !== 404) {
      this.fail("DELETE", response.status);
    }
  }

  private async send(
    method: "GET" | "HEAD" | "PUT" | "DELETE",
    key: string,
    options: {
      body?: Buffer;
      headers?: Record<string, string>;
      timeoutMs: number;
    }
  ): Promise<Response> {
    const { endpoint, bucket, region, accessKeyId, secretAccessKey } =
      this.settings;
    const url = new URL(`${endpoint}${objectPath(bucket, key)}`);
    const headers = signS3Request({
      method,
      url,
      region,
      credentials: { accessKeyId, secretAccessKey },
      payloadSha256: options.body
        ? sha256Hex(options.body)
        : EMPTY_PAYLOAD_SHA256,
      headers: options.headers,
      now: new Date(),
    });
    // The timer covers the wait for the answer's headers only: a download
    // then streams to the reader at its own pace, so it is cleared once they
    // are in rather than left to cut the body off.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), options.timeoutMs);
    try {
      return await this.fetchImpl(url, {
        method,
        headers,
        body: options.body,
        signal: abort.signal,
      });
    } catch (error) {
      this.logger.warn(
        `Bunny Storage ${method} failed: ${error instanceof Error ? error.name : "error"}`
      );
      throw new StorageUnavailableError(error);
    } finally {
      clearTimeout(timer);
    }
  }

  private fail(method: string, status: number): never {
    this.logger.warn(`Bunny Storage ${method} answered ${status}`);
    throw new StorageUnavailableError();
  }
}

function lengthOf(response: Response): number | null {
  const raw = response.headers.get("content-length");
  const size = raw === null ? Number.NaN : Number(raw);
  return Number.isSafeInteger(size) && size >= 0 ? size : null;
}
