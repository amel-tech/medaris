import { MedarisError } from "@medaris/common";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { IBunnyStreamConfig } from "../config/bunny-stream-env";
import {
  BUNNY_TUS_ENDPOINT,
  embedUrl,
  tusUploadSignature,
} from "./bunny-signature";

export class BunnyStreamNotConfiguredError extends MedarisError {
  static readonly code = "BUNNY_STREAM_NOT_CONFIGURED";

  constructor() {
    super(
      BunnyStreamNotConfiguredError.code,
      503,
      "Recording uploads are not available: BUNNY_STREAM_LIBRARY_ID and BUNNY_STREAM_API_KEY are not set on this server"
    );
  }
}

export class BunnyStreamUnavailableError extends MedarisError {
  static readonly code = "BUNNY_STREAM_UNAVAILABLE";

  constructor() {
    super(BunnyStreamUnavailableError.code, 503, "Bunny Stream did not answer");
  }
}

/** The library config, or null when unset (`readBunnyStreamConfig`). Overridable in tests. */
export const BUNNY_STREAM_CONFIG = Symbol("BUNNY_STREAM_CONFIG");
/** The transport the client calls Bunny with. Overridable in tests, which may not reach the network (MDRS-89). */
export const BUNNY_STREAM_FETCH = Symbol("BUNNY_STREAM_FETCH");
export type BunnyFetch = typeof fetch;

const API_ROOT = "https://video.bunnycdn.com/library";
const REQUEST_TIMEOUT_MS = 10_000;

/** What a TUS upload needs from tedrisat; the browser sends these as headers. */
export interface IBunnyUploadAuthorization {
  endpoint: string;
  libraryId: string;
  videoId: string;
  /** Unix seconds. */
  authorizationExpire: number;
  authorizationSignature: string;
}

/** The parts of a Bunny video tedrisat reads. */
export interface IBunnyVideo {
  status: number;
  /** Seconds; 0 until encoded. */
  length: number;
}

/**
 * The one way tedrisat talks to Bunny Stream (MDRS-116): create a video,
 * read a video's status, sign a TUS upload, build a player link. The API key
 * stays inside: callers get a video id, a signature or a link, never the key.
 */
@Injectable()
export class BunnyStreamClient {
  private readonly logger = new Logger(BunnyStreamClient.name);

  constructor(
    @Inject(BUNNY_STREAM_CONFIG)
    private readonly config: IBunnyStreamConfig | null,
    @Inject(BUNNY_STREAM_FETCH) private readonly fetchImpl: BunnyFetch
  ) {}

  isConfigured(): boolean {
    return this.config !== null;
  }

  /** Throws 503 when the library is not configured. */
  assertConfigured(): void {
    if (!this.config) throw new BunnyStreamNotConfiguredError();
  }

  private get settings(): IBunnyStreamConfig {
    if (!this.config) throw new BunnyStreamNotConfiguredError();
    return this.config;
  }

  /** Creates an empty video in the library and returns its id (Bunny's `guid`). */
  async createVideo(title: string): Promise<string> {
    const { libraryId } = this.settings;
    const body = await this.request<{ guid?: unknown }>(
      `${API_ROOT}/${libraryId}/videos`,
      { method: "POST", body: JSON.stringify({ title }) }
    );
    if (body === null || typeof body.guid !== "string" || !body.guid) {
      this.logger.warn("Bunny Create Video answered without a guid");
      throw new BunnyStreamUnavailableError();
    }
    return body.guid;
  }

  /** The video's status and length, or null when Bunny no longer has it. */
  async getVideo(videoId: string): Promise<IBunnyVideo | null> {
    const { libraryId } = this.settings;
    const body = await this.request<{ status?: unknown; length?: unknown }>(
      `${API_ROOT}/${libraryId}/videos/${encodeURIComponent(videoId)}`,
      { method: "GET" }
    );
    if (body === null) return null;
    if (typeof body.status !== "number") {
      this.logger.warn("Bunny Get Video answered without a status");
      throw new BunnyStreamUnavailableError();
    }
    return {
      status: body.status,
      length: typeof body.length === "number" ? body.length : 0,
    };
  }

  /** Signs a TUS upload of `videoId` that Bunny accepts until `expiresAt` (Unix seconds). */
  uploadAuthorization(
    videoId: string,
    expiresAt: number
  ): IBunnyUploadAuthorization {
    const { libraryId, apiKey } = this.settings;
    return {
      endpoint: BUNNY_TUS_ENDPOINT,
      libraryId,
      videoId,
      authorizationExpire: expiresAt,
      authorizationSignature: tusUploadSignature(
        libraryId,
        apiKey,
        expiresAt,
        videoId
      ),
    };
  }

  /**
   * The signed player link of a video, or null when the library is not
   * configured. Its expiry is the library's `embedLifetimeSeconds` from `now`
   * (MDRS-119). Hand it only to a caller the recordings filter let through.
   */
  embedUrl(videoId: string, now: Date = new Date()): string | null {
    if (!this.config) return null;
    return embedUrl(
      this.config.libraryId,
      videoId,
      this.config.tokenKey,
      now,
      this.config.embedLifetimeSeconds
    );
  }

  /** The library's id, or null when none is configured: a pasted Bunny link must name it (MDRS-119). */
  get libraryId(): string | null {
    return this.config?.libraryId ?? null;
  }

  /** JSON from Bunny; null for a 404. Any other failure is a 503 to the caller. */
  private async request<T>(
    url: string,
    init: { method: string; body?: string }
  ): Promise<T | null> {
    const { apiKey } = this.settings;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: init.method,
        body: init.body,
        headers: {
          AccessKey: apiKey,
          accept: "application/json",
          ...(init.body ? { "content-type": "application/json" } : {}),
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.warn(
        `Bunny ${init.method} failed: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new BunnyStreamUnavailableError();
    }
    if (response.status === 404) return null;
    if (!response.ok) {
      this.logger.warn(`Bunny ${init.method} answered ${response.status}`);
      throw new BunnyStreamUnavailableError();
    }
    try {
      return (await response.json()) as T;
    } catch {
      this.logger.warn(`Bunny ${init.method} answered a body that is not JSON`);
      throw new BunnyStreamUnavailableError();
    }
  }
}
