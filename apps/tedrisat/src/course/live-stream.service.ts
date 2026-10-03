import { AuthenticatedUser } from "@medaris/common";
import { parseYoutubeLiveUrl } from "@medaris/utils/src/youtube-live.js";
import { Injectable } from "@nestjs/common";
import { PERMISSIONS } from "../assignment/permission-catalog";
import { CourseRepository } from "./course.repository";
import { CourseAccessService } from "./course-access.service";
import { LessonNotFoundError } from "./errors/lesson-not-found.error";
import { LiveStreamUrlInvalidError } from "./errors/live-stream-url-invalid.error";
import {
  type ILiveStreamLink,
  RecordingRepository,
} from "./recording.repository";

/**
 * A session's live stream link, written by the course staff (MDRS-228) and
 * shown to the enrolled talebe while the session is on air (MDRS-162,
 * `GET /courses/:courseId/sessions/:sessionId`).
 *
 * Both routes are `session.live_link`'s: "Canlı yayın bağlantısını celseye
 * ekle". The müderris and the köşk nazımı hold it by default; a ders nazırı
 * holds it when it is given on the köşk's İzinler page. It is asked for by
 * code (`CourseAccessService`) rather than through a matrix scope, because
 * the matrix has no row for a ders nazırı and widening `EDIT` to reach one
 * would hand them every syllabus write with it.
 */
@Injectable()
export class LiveStreamService {
  // All three must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly access: CourseAccessService,
    private readonly courseRepo: CourseRepository,
    private readonly recordings: RecordingRepository
  ) {}

  /** The course's sessions that have a link, for the staff's Celseler page. */
  async list(
    courseId: string,
    user: AuthenticatedUser
  ): Promise<ILiveStreamLink[]> {
    await this.access.assert(user, courseId, PERMISSIONS.SESSION_LIVE_LINK);
    return this.recordings.findLiveStreams(courseId);
  }

  /**
   * Sets the link, normalised to `https://www.youtube.com/live/<id>`, or
   * clears it (`null`). The permission is asked before the link is read, so a
   * caller who may not set one learns nothing from the validation.
   */
  async set(
    lessonId: string,
    liveStreamUrl: string | null,
    user: AuthenticatedUser
  ): Promise<ILiveStreamLink> {
    const courseId = await this.courseRepo.findLessonCourseId(lessonId);
    if (!courseId) throw new LessonNotFoundError(lessonId);
    await this.access.assert(user, courseId, PERMISSIONS.SESSION_LIVE_LINK);

    let url: string | null = null;
    if (liveStreamUrl !== null) {
      const parsed = parseYoutubeLiveUrl(liveStreamUrl);
      if (!parsed.ok) throw new LiveStreamUrlInvalidError(parsed.problem);
      url = parsed.url;
    }
    const saved = await this.recordings.setLiveStreamUrl(
      lessonId,
      url,
      user.sub
    );
    return { lessonId: saved.lessonId, liveStreamUrl: saved.liveStreamUrl };
  }
}
