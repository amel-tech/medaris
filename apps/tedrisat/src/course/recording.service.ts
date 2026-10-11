import { AuthenticatedUser } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { BunnyStreamClient } from "../bunny-stream/bunny-stream.client";
import { CourseRepository } from "./course.repository";
import {
  type IRecordingRow,
  RecordingStatus,
  RecordingVisibility,
} from "./domain/recording";
import { detectRecordingLink } from "./domain/recording-link";
import type {
  CreateRecordingDto,
  UpdateRecordingDto,
} from "./dto/recording-write.dto";
import { LessonNotFoundError } from "./errors/lesson-not-found.error";
import { RecordingNotFoundError } from "./errors/recording-not-found.error";
import {
  type IRecordingAvailability,
  type IWrittenRecording,
  RecordingRepository,
} from "./recording.repository";
import { RecordingReleasePoller } from "./recording-release.poller";

/**
 * The recordings of a course, written by its staff (MDRS-247): a link that is
 * pasted, its title, its visibility, and when its talebe may watch it
 * (MDRS-288). Every route is `recording.manage`'s ("Kayıtları yönet"): the
 * müderris and the köşk nazımı hold it by default, a ders nazırı when it is
 * given. The routes ask it in their `@Authz`, so by the time a handler runs
 * the caller holds it; what is left here is existence,
 * which the başnazım's bypass skips in the guard, and the link itself.
 *
 * A link is read by `detectRecordingLink` (MDRS-119) and nothing else: a
 * YouTube link is stored as its watch link whatever its visibility, a player
 * link of Medaris's own Bunny library as the video's id, which is signed on
 * every read, and any other https link as pasted. No host is called and
 * nothing is uploaded; the reads stay `GET /courses/:id/recordings`.
 */
@Injectable()
export class RecordingService {
  // All four must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly courseRepo: CourseRepository,
    private readonly recordings: RecordingRepository,
    private readonly bunny: BunnyStreamClient,
    private readonly release: RecordingReleasePoller
  ) {}

  /**
   * Adds the recording of a session. The lesson's course comes first, so a
   * missing lesson is 404 for the başnazım too. The permission was asked in
   * the route's `@Authz`, before the link is read, so a caller who may not add
   * one is not told what would be refused.
   */
  async add(
    lessonId: string,
    dto: CreateRecordingDto,
    user: AuthenticatedUser
  ): Promise<IRecordingRow> {
    if (!(await this.courseRepo.findLessonCourseId(lessonId))) {
      throw new LessonNotFoundError(lessonId);
    }
    const written = await this.recordings.create({
      lessonId,
      title: dto.title,
      link: detectRecordingLink(dto.url, this.bunny.libraryId),
      visibility: dto.visibility ?? RecordingVisibility.ENROLLED,
      availableAt: dto.availableAt,
      actorId: user.sub,
    });
    await this.release.announce(lessonId, user.sub);
    return this.answer(written);
  }

  /** Changes a recording's title, link, visibility or release time. */
  async change(
    recordingId: string,
    dto: UpdateRecordingDto,
    user: AuthenticatedUser
  ): Promise<IRecordingRow> {
    if (!(await this.recordings.findRecordingCourseId(recordingId))) {
      throw new RecordingNotFoundError(recordingId);
    }
    const written = await this.recordings.update(
      recordingId,
      {
        title: dto.title,
        link:
          dto.url === undefined
            ? undefined
            : detectRecordingLink(dto.url, this.bunny.libraryId),
        visibility: dto.visibility,
        availableAt: dto.availableAt,
      },
      user.sub
    );
    await this.release.announce(written.recording.lessonId, user.sub);
    return this.answer(written);
  }

  /**
   * Sets when the session's talebe may watch its recording (MDRS-288), with
   * or before a recording: null opens it as soon as it is READY. A recording
   * this opens now is announced now; one it holds back is announced by the
   * release poll at the time, unless it was announced already.
   */
  async setAvailability(
    lessonId: string,
    availableAt: Date | null,
    user: AuthenticatedUser
  ): Promise<IRecordingAvailability> {
    const saved = await this.recordings.setRecordingAvailableAt(
      lessonId,
      availableAt,
      user.sub
    );
    await this.release.announce(lessonId, user.sub);
    return saved;
  }

  /**
   * The recording as its writer is answered: a READY Bunny recording carries
   * its player link signed for this response, as on the reads (MDRS-119);
   * the video id itself is never returned. The writer holds
   * `recording.manage`, so a recording held back until its release time is
   * played for them as for the rest of the course team (MDRS-288).
   */
  private answer({
    recording,
    bunnyVideoId,
  }: IWrittenRecording): IRecordingRow {
    if (bunnyVideoId === null) return recording;
    return {
      ...recording,
      url:
        recording.status === RecordingStatus.READY
          ? this.bunny.embedUrl(bunnyVideoId)
          : null,
    };
  }
}
