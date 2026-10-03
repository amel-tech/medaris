import { Injectable } from "@nestjs/common";
import { BanRepository } from "../ban/ban.repository";
import { CourseRepository } from "../course/course.repository";
import { EnrollmentStatus } from "../course/domain/enrollment-status.enum";
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
 * without its author. What this decides is who may write: an active
 * enrollment (ENROLLED or COMPLETED) in the session's course that no ban bars,
 * asked here and not through the route matrix because SYSTEM_ADMIN passes the
 * guard on every course and the course team holds `view_details` without
 * being talebe. Reading and deleting one's own notes ask nothing more, so a
 * talebe who was removed or barred can still read and remove what they wrote.
 */
@Injectable()
export class LessonNoteService {
  // All three must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly notes: LessonNoteRepository,
    private readonly courseRepo: CourseRepository,
    private readonly banRepo: BanRepository
  ) {}

  async list(lessonId: string, userId: string): Promise<ILessonNote[]> {
    await this.existing(lessonId);
    return this.notes.findByAuthor(lessonId, userId);
  }

  async create(
    lessonId: string,
    userId: string,
    dto: CreateLessonNoteDto
  ): Promise<ILessonNote> {
    await this.assertMayWrite(lessonId, userId);
    return this.notes.insert(lessonId, userId, {
      body: dto.body,
      offsetSeconds: dto.offsetSeconds ?? null,
    });
  }

  async update(
    lessonId: string,
    noteId: string,
    userId: string,
    dto: UpdateLessonNoteDto
  ): Promise<ILessonNote> {
    await this.assertMayWrite(lessonId, userId);
    const saved = await this.notes.update(noteId, lessonId, userId, dto);
    if (!saved) throw new LessonNoteNotFoundError(noteId);
    return saved;
  }

  async remove(
    lessonId: string,
    noteId: string,
    userId: string
  ): Promise<void> {
    await this.existing(lessonId);
    if (!(await this.notes.remove(noteId, lessonId, userId))) {
      throw new LessonNoteNotFoundError(noteId);
    }
  }

  /** The course the session belongs to; 404 when there is no such session. */
  private async existing(lessonId: string): Promise<string> {
    const courseId = await this.courseRepo.findLessonCourseId(lessonId);
    if (!courseId) throw new LessonNotFoundError(lessonId);
    return courseId;
  }

  private async assertMayWrite(
    lessonId: string,
    userId: string
  ): Promise<void> {
    const courseId = await this.existing(lessonId);
    const enrollment = await this.courseRepo.findEnrollment(userId, courseId);
    const active =
      enrollment?.status === EnrollmentStatus.ENROLLED ||
      enrollment?.status === EnrollmentStatus.COMPLETED;
    if (!active || (await this.banRepo.isBarredFromCourse(userId, courseId))) {
      throw new LessonNoteForbiddenError();
    }
  }
}
