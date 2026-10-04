import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { encodingOutcome } from "../bunny-stream/bunny-signature";
import { BunnyStreamClient } from "../bunny-stream/bunny-stream.client";
import { RecordingStatus } from "./domain/recording";
import { RecordingRepository } from "./recording.repository";

/** How often the poll runs while the library is configured. */
export const ENCODING_POLL_INTERVAL_MS = 60_000;
/** Recordings read from Bunny per poll, oldest-updated first. */
const POLL_BATCH = 50;

export interface IEncodingPollResult {
  ready: number;
  failed: number;
  waiting: number;
  errors: number;
}

/**
 * Moves Bunny uploads out of PROCESSING (MDRS-116, part A, step 4): READY
 * once Bunny has encoded the video, FAILED when Bunny could not, when the
 * video is gone from the library, or when the upload's lifetime passed with
 * no complete file (`encodingOutcome`). Polling rather than Bunny's webhooks,
 * because how those are authenticated was not checked.
 *
 * Starts only when the library is configured, so a server without the Bunny
 * keys — every test app among them — runs no timer. Several tedrisat
 * instances polling at once is harmless: a row is settled only while it is
 * still PROCESSING with the same video (`settleBunnyUpload`).
 */
@Injectable()
export class RecordingEncodingPoller
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(RecordingEncodingPoller.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  // Both must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly bunny: BunnyStreamClient,
    private readonly recordings: RecordingRepository
  ) {}

  onApplicationBootstrap(): void {
    if (!this.bunny.isConfigured()) return;
    this.timer = setInterval(() => {
      void this.pollOnce().catch((error: unknown) =>
        this.logger.error(
          `Encoding poll failed: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }, ENCODING_POLL_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * One pass over the uploads still PROCESSING. A poll still running when
   * the next tick comes is not overlapped. One video Bunny does not answer
   * for is counted in `errors` and retried on the next pass.
   */
  async pollOnce(now: Date = new Date()): Promise<IEncodingPollResult> {
    const result: IEncodingPollResult = {
      ready: 0,
      failed: 0,
      waiting: 0,
      errors: 0,
    };
    if (this.running || !this.bunny.isConfigured()) return result;
    this.running = true;
    try {
      const pending =
        await this.recordings.findProcessingBunnyUploads(POLL_BATCH);
      for (const upload of pending) {
        try {
          const video = await this.bunny.getVideo(upload.bunnyVideoId);
          const outcome =
            video === null
              ? "FAILED"
              : encodingOutcome(video.status, upload.uploadExpiresAt, now);
          if (outcome === null) {
            result.waiting++;
            continue;
          }
          const minutes =
            outcome === "READY" && video !== null && video.length > 0
              ? Math.max(1, Math.round(video.length / 60))
              : null;
          const changed = await this.recordings.settleBunnyUpload(
            upload.id,
            upload.bunnyVideoId,
            outcome === "READY"
              ? RecordingStatus.READY
              : RecordingStatus.FAILED,
            minutes
          );
          if (changed) {
            if (outcome === "READY") result.ready++;
            else result.failed++;
          }
        } catch (error) {
          result.errors++;
          this.logger.warn(
            `Could not read Bunny video ${upload.bunnyVideoId}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
      return result;
    } finally {
      this.running = false;
    }
  }
}
