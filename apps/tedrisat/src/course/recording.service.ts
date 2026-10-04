import { AuthenticatedUser } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { CourseRepository } from "./course.repository";
import {
  applyRecordingPatch,
  type IRecordingRow,
  RecordingProvider,
  RecordingVisibility,
} from "./domain/recording";
import type {
  CreateRecordingDto,
  UpdateRecordingDto,
} from "./dto/recording-write.dto";
import { LessonNotFoundError } from "./errors/lesson-not-found.error";
import { RecordingNotFoundError } from "./errors/recording-not-found.error";
import { RecordingRepository } from "./recording.repository";

/**
 * The recordings of a course, written by its staff (MDRS-247): a link that is
 * pasted, its title, its visibility. Both routes are `recording.manage`'s
 * ("Kayıtları yönet"): the müderris and the köşk nazımı hold it by default, a
 * ders nazırı when it is given. The routes ask it in their `@Authz`, so by the
 * time a handler runs the caller holds it; what is left here is existence,
 * which the başnazım's bypass skips in the guard. Nothing is uploaded and no
 * host is called; the reads stay `GET /courses/:id/recordings`.
 */
@Injectable()
export class RecordingService {
  // Both must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly courseRepo: CourseRepository,
    private readonly recordings: RecordingRepository
  ) {}

  /**
   * Adds the recording of a session. The lesson's course comes first, so a
   * missing lesson is 404 for the başnazım too. The permission was asked in
   * the route's `@Authz`, before the YouTube rule, so a caller who may not add
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

    const visibility = dto.visibility ?? RecordingVisibility.ENROLLED;
    // The same rule as a patch, applied to the recording that does not exist yet.
    const { provider } = applyRecordingPatch(
      {
        title: dto.title,
        url: dto.url,
        visibility,
        provider: RecordingProvider.OTHER,
      },
      { url: dto.url, visibility }
    );
    return this.recordings.create({
      lessonId,
      title: dto.title,
      url: dto.url,
      provider,
      visibility,
      actorId: user.sub,
    });
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
    return this.recordings.update(
      recordingId,
      { title: dto.title, url: dto.url, visibility: dto.visibility },
      user.sub
    );
  }
}
