import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { isTestRunner } from "../config/security-env";
import { CourseNotifier } from "./course-notifier";
import { RecordingRepository } from "./recording.repository";

/** How often the release poll runs. A recording opens on every read at its time; only its announcement waits for this. */
export const RELEASE_POLL_INTERVAL_MS = 60_000;
/** Recordings announced per pass; what is left goes on the next one. */
export const RELEASE_POLL_BATCH = 100;

/**
 * "Kayıt eklendi" (MDRS-283) at the moment a recording opens to its talebe
 * (MDRS-288). A recording opens when it is READY, its session has begun and
 * the release time the course team set, if any, has come
 * (`recordingReleaseAt`); every read decides that on its own clock
 * (`isReleased`), so nothing has to happen at the time for the recording to
 * play. Its announcement does, and this owns it:
 *
 * - `announce` is called after every write that may have opened a recording
 *   (a pasted link, a link replaced, a release time changed) and by the
 *   encoding poll when an upload turns READY. With that time already past,
 *   that is MDRS-283's moment: the write that made it READY.
 * - `releaseDue` runs every minute and announces the recordings whose
 *   release time came since, a recording added before its session at the
 *   session's start, so a time moved before it fires moves the announcement
 *   with it.
 *
 * Both claim the recording first (`notified_at`, one statement that checks
 * and marks), so it is announced once whoever gets there first, and never
 * again: a time moved after it fired, a link replaced or a title changed is
 * not news. Several tedrisat instances polling at once is harmless for the
 * same reason. Like every producer, a notification that cannot be written
 * never undoes the write that caused it.
 *
 * Under the test runner no timer runs: a spec calls `releaseDue` with its own
 * clock, and a background pass cannot land inside another spec's count of
 * statements (`authz-query-count.e2e.spec.ts`).
 */
@Injectable()
export class RecordingReleasePoller
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(RecordingReleasePoller.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  // Both must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly recordings: RecordingRepository,
    private readonly notifier: CourseNotifier
  ) {}

  onApplicationBootstrap(): void {
    if (isTestRunner()) return;
    this.timer = setInterval(() => {
      void this.releaseDue().catch((error: unknown) =>
        this.logger.error(
          `Release poll failed: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }, RELEASE_POLL_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Tells the session's talebe that its recording can be watched, when it is
   * READY and released at `now` and nobody told them yet. `actorId`, the
   * writer, is not told of their own write; the encoding poll has none.
   */
  async announce(
    lessonId: string,
    actorId?: string,
    now: Date = new Date()
  ): Promise<void> {
    try {
      if (!(await this.recordings.claimAnnouncement(lessonId, now))) return;
    } catch (error) {
      this.logger.error(
        `Could not claim the recording of session ${lessonId}`,
        error
      );
      return;
    }
    await this.notifier.recordingAdded(lessonId, actorId);
  }

  /**
   * One pass: announces every READY recording whose release time has come by
   * `now` and that was not announced, up to `batch`. A pass still running
   * when the next tick comes is not overlapped. Returns how many it claimed.
   */
  async releaseDue(
    now: Date = new Date(),
    batch: number = RELEASE_POLL_BATCH
  ): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const lessonIds = await this.recordings.claimDueAnnouncements(now, batch);
      for (const lessonId of lessonIds) {
        await this.notifier.recordingAdded(lessonId);
      }
      return lessonIds.length;
    } finally {
      this.running = false;
    }
  }
}
