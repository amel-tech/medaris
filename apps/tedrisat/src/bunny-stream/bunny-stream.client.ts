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
 * read a video's status, delete a video that left its recording, sign a TUS
 * upload, build a player link. The API key stays inside: callers get a video
 * id, a signature or a link, never the key.
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

  /**
   * Creates an empty video in the library and returns its id (Bunny's `guid`).
   * With a collection configured the video is created in it, otherwise at the
   * library root.
   */
  async createVideo(title: string): Promise<string> {
    const { libraryId, collectionId } = this.settings;
    const body = await this.request<{ guid?: unknown }>(
      `${API_ROOT}/${libraryId}/videos`,
      {
        method: "POST",
        body: JSON.stringify(
          collectionId ? { title, collectionId } : { title }
        ),
      }
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

  /**
   * Deletes a video from the library: true once Bunny deleted it, false when
   * Bunny no longer had it (404), which leaves the library as wanted all the
   * same. Any other answer is BUNNY_STREAM_UNAVAILABLE. Bunny's body is not
   * read: its status code says it all.
   */
  async deleteVideo(videoId: string): Promise<boolean> {
    const { libraryId } = this.settings;
    const response = await this.send(
      `${API_ROOT}/${libraryId}/videos/${encodeURIComponent(videoId)}`,
      { method: "DELETE" }
    );
    return response !== null;
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
    const response = await this.send(url, init);
    if (response === null) return null;
    try {
      return (await response.json()) as T;
    } catch {
      this.logger.warn(`Bunny ${init.method} answered a body that is not JSON`);
      throw new BunnyStreamUnavailableError();
    }
  }

  /** Bunny's answer when it is a success; null for a 404. Any other failure is a 503 to the caller. */
  private async send(
    url: string,
    init: { method: string; body?: string }
  ): Promise<Response | null> {
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
    return response;
  }
}
