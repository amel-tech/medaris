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
import { RecordingReleasePoller } from "./recording-release.poller";

/** How often the poll runs while the library is configured. */
export const ENCODING_POLL_INTERVAL_MS = 60_000;
/**
 * Recordings read from Bunny per poll, least recently updated first. A row
 * the poll leaves waiting is sent to the back of the queue, so more than
 * this many waiting uploads delay one another but never starve one.
 */
export const ENCODING_POLL_BATCH = 50;
/**
 * Replaced videos deleted from Bunny per poll, the least recently tried
 * first. Deletions are rare (a wrong file replaced, a link pasted over a
 * video); a video Bunny keeps refusing goes to the back, so it never holds
 * up the others.
 */
export const VIDEO_REMOVAL_BATCH = 20;

export interface IEncodingPollResult {
  ready: number;
  failed: number;
  waiting: number;
  errors: number;
  /** replaced videos deleted from Bunny, or found already gone */
  removed: number;
  /** replaced videos Bunny did not delete this time; tried again later */
  removeErrors: number;
}

/**
 * Moves Bunny uploads out of PROCESSING (MDRS-116, part A, step 4): READY
 * once Bunny has encoded the video, FAILED when Bunny could not, when the
 * video is gone from the library, or when the upload's lifetime passed with
 * no complete file (`encodingOutcome`). Polling rather than Bunny's webhooks,
 * because how those are authenticated was not checked.
 *
 * Then, on the same timer, it deletes from Bunny the videos that left their
 * recording (`bunny_video_removals`, 13 October): a wrong file replaced by a
 * new upload goes once that upload is over, one a pasted link replaced at
 * once, and none a recording holds again.
 *
 * Starts only when the library is configured, so a server without the Bunny
 * keys — every test app among them — runs no timer. Several tedrisat
 * instances polling at once is harmless: a row is settled only while it is
 * still PROCESSING with the same video (`settleBunnyUpload`), and a video
 * deleted twice is found gone the second time, which counts as done.
 */
@Injectable()
export class RecordingEncodingPoller
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(RecordingEncodingPoller.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  // All three must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly bunny: BunnyStreamClient,
    private readonly recordings: RecordingRepository,
    private readonly release: RecordingReleasePoller
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
   * One pass over the uploads still PROCESSING, then over the replaced
   * videos that are due for deletion. A poll still running when the next
   * tick comes is not overlapped. One video Bunny does not answer for is
   * counted in `errors` and retried on a later pass. A video left waiting,
   * or not answered for, is moved to the back of the queue. Settling comes
   * first, so an upload that turns READY or FAILED in this pass has the video
   * it replaced deleted in the same pass.
   */
  async pollOnce(
    now: Date = new Date(),
    batch: number = ENCODING_POLL_BATCH
  ): Promise<IEncodingPollResult> {
    const result: IEncodingPollResult = {
      ready: 0,
      failed: 0,
      waiting: 0,
      errors: 0,
      removed: 0,
      removeErrors: 0,
    };
    if (this.running || !this.bunny.isConfigured()) return result;
    this.running = true;
    try {
      await this.settle(now, batch, result);
      await this.removeReplaced(now, result);
      return result;
    } finally {
      this.running = false;
    }
  }

  private async settle(
    now: Date,
    batch: number,
    result: IEncodingPollResult
  ): Promise<void> {
    const pending = await this.recordings.findProcessingBunnyUploads(batch);
    for (const upload of pending) {
      try {
        const video = await this.bunny.getVideo(upload.bunnyVideoId);
        const outcome =
          video === null
            ? "FAILED"
            : encodingOutcome(video.status, upload.uploadExpiresAt, now);
        if (outcome === null) {
          result.waiting++;
          await this.recordings.touchBunnyUpload(
            upload.id,
            upload.bunnyVideoId
          );
          continue;
        }
        const minutes =
          outcome === "READY" && video !== null && video.length > 0
            ? Math.max(1, Math.round(video.length / 60))
            : null;
        const changed = await this.recordings.settleBunnyUpload(
          upload.id,
          upload.bunnyVideoId,
          outcome === "READY" ? RecordingStatus.READY : RecordingStatus.FAILED,
          minutes
        );
        if (changed) {
          if (outcome === "READY") {
            result.ready++;
            // The upload was PROCESSING until now: with no release time,
            // or one already past, this is the moment the session's talebe
            // can watch it (MDRS-283); with one still ahead the release
            // poll announces it then (MDRS-288).
            await this.release.announce(upload.lessonId, undefined, now);
          } else result.failed++;
        }
      } catch (error) {
        result.errors++;
        this.logger.warn(
          `Could not read Bunny video ${upload.bunnyVideoId}: ${error instanceof Error ? error.message : String(error)}`
        );
        await this.recordings
          .touchBunnyUpload(upload.id, upload.bunnyVideoId)
          .catch(() => undefined);
      }
    }
  }

  /**
   * Deletes from Bunny the replaced videos that are due
   * (`claimVideoRemovals`). A video Bunny no longer has counts as deleted. A
   * refusal is counted in `removeErrors`, logged with the number of tries so
   * far (never the API key, which `BunnyStreamClient` keeps to itself) and
   * tried again on a later pass, behind the videos tried less recently. There
   * is no cap: a video that cannot be deleted keeps its row, and the warning,
   * until someone looks.
   */
  private async removeReplaced(
    now: Date,
    result: IEncodingPollResult
  ): Promise<void> {
    const { due, kept } =
      await this.recordings.claimVideoRemovals(VIDEO_REMOVAL_BATCH);
    if (kept > 0) {
      this.logger.log(
        `Kept ${kept} replaced Bunny video(s) that a recording holds again`
      );
    }
    for (const removal of due) {
      try {
        const deleted = await this.bunny.deleteVideo(removal.videoId);
        if (await this.recordings.finishVideoRemoval(removal, !deleted)) {
          result.removed++;
        }
      } catch (error) {
        result.removeErrors++;
        const attempts = await this.recordings
          .failVideoRemoval(removal.videoId, now)
          .catch(() => removal.attempts + 1);
        this.logger.warn(
          `Could not delete replaced Bunny video ${removal.videoId} (attempt ${attempts}): ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }
}
