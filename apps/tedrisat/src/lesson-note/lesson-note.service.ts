import {
  AuthenticatedUser,
  AuthzService,
  ENTITIES,
  PERMISSIONS,
} from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { CourseRepository } from "../course/course.repository";
import { CourseService } from "../course/course.service";
import { CourseNotFoundError } from "../course/errors/course-not-found.error";
import { LessonNotFoundError } from "../course/errors/lesson-not-found.error";
import type {
  CreateLessonNoteDto,
  UpdateLessonNoteDto,
} from "./dto/lesson-note.dto";
import { LessonNoteForbiddenError } from "./errors/lesson-note-forbidden.error";
import { LessonNoteNotFoundError } from "./errors/lesson-note-not-found.error";
import {
  type ILessonNote,
  LessonNoteRepository,
} from "./lesson-note.repository";

/**
 * A talebe's private notes on a session's video (MDRS-150).
 *
 * Whose they are is decided by the repository, which never reads a note
 * without its author. Two things are decided here, the engine's and the
 * enrollment's:
 *
 * - **Whether the course is open to the caller** is the engine's answer, as
 *   for every read of course content: the course must be one the caller may
 *   see (`CourseService.getDetail`: a hidden köşk, a hidden course, a draft),
 *   and its content must not be closed to them (`course.view_details`: a
 *   passive scope closes it, and a pending, removed or barred talebe never
 *   held it). `AuthzGuard` has already refused a course of a hidden köşk.
 * - **Who may write** is also an active enrollment (ENROLLED or COMPLETED)
 *   that no ban bars, which the engine cannot say: SYSTEM_ADMIN passes it on
 *   every course and the course team holds `course.view_details` without
 *   being talebe.
 *
 * Reading and deleting one's own notes ask only the first, so a talebe who
 * was removed or barred can still read and remove what they wrote while the
 * course is open; a passive scope closes them like the rest of its content.
 */
@Injectable()
export class LessonNoteService {
  // All four must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly notes: LessonNoteRepository,
    private readonly courseRepo: CourseRepository,
    private readonly courseService: CourseService,
    private readonly authz: AuthzService
  ) {}

  async list(
    user: AuthenticatedUser,
    lessonId: string
  ): Promise<ILessonNote[]> {
    await this.assertReadable(user, await this.visibleCourse(user, lessonId));
    return this.notes.findByAuthor(lessonId, user.sub);
  }

  async create(
    user: AuthenticatedUser,
    lessonId: string,
    dto: CreateLessonNoteDto
  ): Promise<ILessonNote> {
    await this.assertMayWrite(user, await this.visibleCourse(user, lessonId));
    return this.notes.insert(lessonId, user.sub, {
      body: dto.body,
      offsetSeconds: dto.offsetSeconds ?? null,
    });
  }

  async update(
    user: AuthenticatedUser,
    lessonId: string,
    noteId: string,
    dto: UpdateLessonNoteDto
  ): Promise<ILessonNote> {
    await this.assertMayWrite(user, await this.visibleCourse(user, lessonId));
    const saved = await this.notes.update(noteId, lessonId, user.sub, dto);
    if (!saved) throw new LessonNoteNotFoundError(noteId);
    return saved;
  }

  async remove(
    user: AuthenticatedUser,
    lessonId: string,
    noteId: string
  ): Promise<void> {
    await this.assertReadable(user, await this.visibleCourse(user, lessonId));
    if (!(await this.notes.remove(noteId, lessonId, user.sub))) {
      throw new LessonNoteNotFoundError(noteId);
    }
  }

  /**
   * The course the session belongs to. A session that is not there and one in
   * a course the caller may not see are one answer, as on the session's
   * calendar entry (`CourseService.getScheduledLesson`), so a hidden course is
   * not told apart from a session that never existed.
   */
  private async visibleCourse(
    user: AuthenticatedUser,
    lessonId: string
  ): Promise<string> {
    const courseId = await this.courseRepo.findLessonCourseId(lessonId);
    if (!courseId) throw new LessonNotFoundError(lessonId);
    try {
      await this.courseService.getDetail(courseId, user, { read: true });
    } catch (error) {
      if (error instanceof CourseNotFoundError) {
        throw new LessonNotFoundError(lessonId);
      }
      throw error;
    }
    return courseId;
  }

  /**
   * Content open to the caller, or else no scope closing it for everyone. A
   * talebe who lost their seat holds no content code for a passive scope to
   * take away, so the scope itself is asked: an open course lets them read and
   * delete what they wrote, a passive one does not.
   */
  private async assertReadable(
    user: AuthenticatedUser,
    courseId: string
  ): Promise<void> {
    if (await this.contentIsOpen(user, courseId)) return;
    if (await this.courseRepo.findPassiveScope(courseId)) {
      throw new LessonNoteForbiddenError();
    }
  }

  private async assertMayWrite(
    user: AuthenticatedUser,
    courseId: string
  ): Promise<void> {
    if (
      !(await this.courseService.isActiveTalebe(user.sub, courseId)) ||
      !(await this.contentIsOpen(user, courseId))
    ) {
      throw new LessonNoteForbiddenError();
    }
  }

  private contentIsOpen(
    user: AuthenticatedUser,
    courseId: string
  ): Promise<boolean> {
    return this.authz.can(
      user,
      { entity: ENTITIES.COURSE, id: courseId },
      PERMISSIONS.COURSE_VIEW_DETAILS
    );
  }
}
