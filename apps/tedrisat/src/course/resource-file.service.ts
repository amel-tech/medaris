import type { AuthenticatedUser } from "@medaris/common";
import { Injectable, type StreamableFile } from "@nestjs/common";
import type { Response } from "express";
import { ObjectStorage } from "../storage/object-storage";
import { courseResourceKey, lessonResourceKey } from "../storage/storage-keys";
import { streamStoredFile } from "../storage/stored-file";
import { acceptUpload } from "../storage/upload";
import { UploadStore } from "../storage/upload-store";
import { CourseRepository } from "./course.repository";
import type { ILessonResource, IResource } from "./course.repository.interface";
import { CourseService } from "./course.service";
import { LessonNotFoundError } from "./errors/lesson-not-found.error";
import { ResourceFileNotFoundError } from "./errors/resource-file-not-found.error";

/** What an upload route reads beside the file. */
export interface IResourceFileFields {
  name?: string | null;
  meta?: string | null;
}

/** The listed name: the one sent, else the file's own without its extension. */
const listedName = (sent: string | null | undefined, fileName: string) =>
  sent || fileName.replace(/\.[^.]+$/, "") || fileName;

/**
 * A course's and a celse's resources as files in Medaris storage (MDRS-287).
 *
 * Uploading is the permission that edits the list today, on the route:
 * `course.edit` for the course's, `session.manage` for a celse's. The course
 * must also be one the caller may write (a müderris does not write to a course
 * the köşk hid), and a celse must be live. The file is checked by its bytes
 * and size (`acceptUpload`), stored under a key tedrisat builds, and added as
 * the last resource; the upload and later the removal go to `audit_log`.
 *
 * Downloading is for whoever may read the course's content
 * (`course.view_details` on the route): the enrolled talebe and the course
 * team, exactly who is sent a link resource's address. The read is the course
 * page's (`viewDetail`), so a hidden course, a draft and a passive scope
 * answer as they do there, and a content read by someone who is neither an
 * enrolled talebe nor a müderris goes on the record. The file is streamed
 * through tedrisat as an attachment; no address of the store is ever sent.
 */
@Injectable()
export class ResourceFileService {
  // All must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly courses: CourseService,
    private readonly courseRepo: CourseRepository,
    private readonly storage: ObjectStorage,
    private readonly uploads: UploadStore
  ) {}

  async uploadCourseFile(
    courseId: string,
    user: AuthenticatedUser,
    file: Express.Multer.File | undefined,
    fields: IResourceFileFields
  ): Promise<{ resource: IResource; courseVersion: number }> {
    this.storage.assertConfigured();
    await this.courses.getDetail(courseId, user);
    const accepted = acceptUpload(file);
    return this.uploads.store(
      courseResourceKey(this.storage.keyPrefix(), courseId),
      accepted,
      (stored) =>
        this.courseRepo.addCourseResourceFile(courseId, {
          name: listedName(fields.name, accepted.fileName),
          meta: fields.meta ?? null,
          file: stored,
          actorId: user.sub,
        })
    );
  }

  async uploadLessonFile(
    lessonId: string,
    user: AuthenticatedUser,
    file: Express.Multer.File | undefined,
    fields: IResourceFileFields
  ): Promise<{ resource: ILessonResource; courseVersion: number }> {
    this.storage.assertConfigured();
    const courseId = await this.courses.findWritableLessonCourse(
      lessonId,
      user
    );
    const accepted = acceptUpload(file);
    return this.uploads.store(
      lessonResourceKey(this.storage.keyPrefix(), courseId, lessonId),
      accepted,
      (stored) =>
        this.courseRepo.addLessonResourceFile(lessonId, {
          name: listedName(fields.name, accepted.fileName),
          meta: fields.meta ?? null,
          file: stored,
          actorId: user.sub,
        })
    );
  }

  async downloadCourseFile(
    courseId: string,
    resourceId: string,
    user: AuthenticatedUser,
    response: Response
  ): Promise<StreamableFile> {
    this.storage.assertConfigured();
    const detail = await this.courses.viewDetail(courseId, user, {
      audit: true,
      via: "resource.download",
    });
    const file = detail.contentLocked
      ? null
      : await this.courseRepo.findCourseResourceFile(courseId, resourceId);
    if (!file) throw new ResourceFileNotFoundError(resourceId);
    return streamStoredFile(
      this.storage,
      file,
      response,
      () => new ResourceFileNotFoundError(resourceId)
    );
  }

  async downloadLessonFile(
    lessonId: string,
    resourceId: string,
    user: AuthenticatedUser,
    response: Response
  ): Promise<StreamableFile> {
    this.storage.assertConfigured();
    const courseId = await this.courses.findVisibleLessonCourse(lessonId, user);
    const detail = await this.courses.viewDetail(courseId, user, {
      audit: true,
      via: "resource.download",
    });
    // A hidden celse's resources are kept, not served (MDRS-286).
    const live = detail.weeks.some((week) =>
      week.lessons.some((lesson) => lesson.id === lessonId)
    );
    if (!live) throw new LessonNotFoundError(lessonId);
    const file = detail.contentLocked
      ? null
      : await this.courseRepo.findLessonResourceFile(lessonId, resourceId);
    if (!file) throw new ResourceFileNotFoundError(resourceId);
    return streamStoredFile(
      this.storage,
      file,
      response,
      () => new ResourceFileNotFoundError(resourceId)
    );
  }
}
