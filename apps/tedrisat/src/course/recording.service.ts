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
  type IWrittenRecording,
  RecordingRepository,
} from "./recording.repository";

/**
 * The recordings of a course, written by its staff (MDRS-247): a link that is
 * pasted, its title, its visibility. Both routes are `recording.manage`'s
 * ("Kayıtları yönet"): the müderris and the köşk nazımı hold it by default, a
 * ders nazırı when it is given. The routes ask it in their `@Authz`, so by the
 * time a handler runs the caller holds it; what is left here is existence,
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
  // All three must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly courseRepo: CourseRepository,
    private readonly recordings: RecordingRepository,
    private readonly bunny: BunnyStreamClient
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
      actorId: user.sub,
    });
    return this.answer(written);
  }

  /** Changes a recording's title, link or visibility. */
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
      },
      user.sub
    );
    return this.answer(written);
  }

  /**
   * The recording as its writer is answered: a READY Bunny recording carries
   * its player link signed for this response, as on the reads (MDRS-119);
   * the video id itself is never returned.
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
