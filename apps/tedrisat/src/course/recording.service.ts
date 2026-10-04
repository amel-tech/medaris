import { AuthenticatedUser } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { PERMISSIONS } from "../assignment/permission-catalog";
import { CourseRepository } from "./course.repository";
import { CourseAccessService } from "./course-access.service";
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
 * ders nazırı when it is given. It is asked by code (`CourseAccessService`)
 * for the reason `LiveStreamService` gives: the route matrix has no row for a
 * ders nazırı. Nothing is uploaded and no host is called; the reads stay
 * `GET /courses/:id/recordings`.
 *
 * Interim, as in `CourseAccessService`: MDRS-135 replaces the check with the
 * permission engine.
 */
@Injectable()
export class RecordingService {
  // All three must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly access: CourseAccessService,
    private readonly courseRepo: CourseRepository,
    private readonly recordings: RecordingRepository
  ) {}

  /**
   * Adds the recording of a session. The lesson's course comes first, so a
   * missing lesson is 404, and the permission is asked before the YouTube
   * rule, so a caller who may not add one is not told what would be refused.
   */
  async add(
    lessonId: string,
    dto: CreateRecordingDto,
    user: AuthenticatedUser
  ): Promise<IRecordingRow> {
    const courseId = await this.courseRepo.findLessonCourseId(lessonId);
    if (!courseId) throw new LessonNotFoundError(lessonId);
    await this.access.assert(user, courseId, PERMISSIONS.RECORDING_MANAGE);

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
    const courseId = await this.recordings.findRecordingCourseId(recordingId);
    if (!courseId) throw new RecordingNotFoundError(recordingId);
    await this.access.assert(user, courseId, PERMISSIONS.RECORDING_MANAGE);
    return this.recordings.update(
      recordingId,
      { title: dto.title, url: dto.url, visibility: dto.visibility },
      user.sub
    );
  }
}
