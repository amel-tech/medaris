import { AuthenticatedUser } from "@medaris/common";
import { parseYoutubeLiveUrl } from "@medaris/utils/src/youtube-live.js";
import { Injectable } from "@nestjs/common";
import { CourseRepository } from "./course.repository";
import { CourseNotFoundError } from "./errors/course-not-found.error";
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
 * holds it when it is given on the köşk's İzinler page. The routes ask it in
 * their `@Authz`, so by the time a handler runs the caller holds it; what is
 * left here is existence, which the başnazım's bypass skips in the guard.
 */
@Injectable()
export class LiveStreamService {
  // Both must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly courseRepo: CourseRepository,
    private readonly recordings: RecordingRepository
  ) {}

  /** The course's sessions that have a link, for the staff's Celseler page. */
  async list(courseId: string): Promise<ILiveStreamLink[]> {
    // Existence for the başnazım too: the guard's bypass answers before any
    // resolver looks the course up.
    if ((await this.courseRepo.findKoskId(courseId)) === null) {
      throw new CourseNotFoundError(courseId);
    }
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
