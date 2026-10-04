import { AuthenticatedUser } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { CourseService } from "../course/course.service";
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
 * without its author. Whether the caller may reach the course at all is the
 * engine's, through `CourseService`, as for every read of course content: the
 * course must be one they may see (a hidden köşk, a hidden course and a draft
 * answer as a session that is not there), and its content must not be closed
 * to them (a passive scope closes it to the enrolled talebe too).
 *
 * Writing takes an active talebe on top of that (`mayWriteAsTalebe`). Reading
 * and deleting one's own notes take only an open course, so a talebe who was
 * removed or barred can still read and remove what they wrote
 * (`mayReachOwnWriting`).
 */
@Injectable()
export class LessonNoteService {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(
    private readonly notes: LessonNoteRepository,
    private readonly courseService: CourseService
  ) {}

  async list(
    user: AuthenticatedUser,
    lessonId: string
  ): Promise<ILessonNote[]> {
    await this.assertReachable(user, lessonId);
    return this.notes.findByAuthor(lessonId, user.sub);
  }

  async create(
    user: AuthenticatedUser,
    lessonId: string,
    dto: CreateLessonNoteDto
  ): Promise<ILessonNote> {
    await this.assertMayWrite(user, lessonId);
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
    await this.assertMayWrite(user, lessonId);
    const saved = await this.notes.update(noteId, lessonId, user.sub, dto);
    if (!saved) throw new LessonNoteNotFoundError(noteId);
    return saved;
  }

  async remove(
    user: AuthenticatedUser,
    lessonId: string,
    noteId: string
  ): Promise<void> {
    await this.assertReachable(user, lessonId);
    if (!(await this.notes.remove(noteId, lessonId, user.sub))) {
      throw new LessonNoteNotFoundError(noteId);
    }
  }

  private async assertMayWrite(
    user: AuthenticatedUser,
    lessonId: string
  ): Promise<void> {
    const courseId = await this.courseService.findVisibleLessonCourse(
      lessonId,
      user
    );
    if (!(await this.courseService.mayWriteAsTalebe(user, courseId))) {
      throw new LessonNoteForbiddenError();
    }
  }

  private async assertReachable(
    user: AuthenticatedUser,
    lessonId: string
  ): Promise<void> {
    const courseId = await this.courseService.findVisibleLessonCourse(
      lessonId,
      user
    );
    if (!(await this.courseService.mayReachOwnWriting(user, courseId))) {
      throw new LessonNoteForbiddenError();
    }
  }
}
