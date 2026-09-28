import {
  AuthenticatedUser,
  AuthzService,
  ENTITIES,
  SCOPES,
} from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { KoskForbiddenError } from "../kosk/errors/kosk-forbidden.error";
import { KoskService } from "../kosk/kosk.service";
import { CourseRepository } from "./course.repository";
import {
  ICourse,
  ICourseDetail,
  ICourseSummary,
  ICreateCourse,
  ICreateLesson,
  IEnrolledCourse,
  IEnrollment,
  ILessonMutation,
  IPendingEnrollment,
  IReplaceCourse,
  IUpdateCourse,
  IUpdateLesson,
} from "./course.repository.interface";
import { CourseStatus } from "./domain/course-status.enum";
import { EnrollmentStatus } from "./domain/enrollment-status.enum";
import { withCanonicalTimeZone } from "./domain/time-zone";
import { CourseNotFoundError } from "./errors/course-not-found.error";
import { EnrollmentNotFoundError } from "./errors/enrollment-not-found.error";

export interface StudentIdentity {
  name?: string | null;
  email?: string | null;
}

@Injectable()
export class CourseService {
  constructor(
    private readonly courseRepo: CourseRepository,
    private readonly koskService: KoskService,
    private readonly authz: AuthzService
  ) {}

  /**
   * The köşk's courses. With `archived`, its hidden ones instead — the
   * "Arşiv" view (MDRS-124), for the köşk manager and SYSTEM_ADMIN only;
   * anyone else asking for it gets 403.
   */
  async findSummariesByKosk(
    koskId: string,
    user: AuthenticatedUser,
    archived = false
  ): Promise<ICourseSummary[]> {
    const kosk = await this.koskService.findById(koskId, user.sub); // throws if köşk is missing
    const isOwner = kosk.ownerId === user.sub;
    if (archived) {
      if (!isOwner && !this.authz.isSystemAdmin(user)) {
        throw new KoskForbiddenError();
      }
      return this.courseRepo.findSummariesByKosk(koskId, user.sub, true, true);
    }
    // Only the köşk owner sees DRAFT courses; everyone else gets PUBLISHED only.
    return this.courseRepo.findSummariesByKosk(koskId, user.sub, isOwner);
  }

  async findEnrolledCourses(userId: string): Promise<IEnrolledCourse[]> {
    return this.courseRepo.findEnrolledByUser(userId);
  }

  async getDetail(id: string, user: AuthenticatedUser): Promise<ICourseDetail> {
    const userId = user.sub;
    const course = await this.courseRepo.findDetailById(id, userId);
    if (!course) {
      throw new CourseNotFoundError(id);
    }
    // A hidden course (MDRS-124) is not-found, exactly like a draft, to all
    // but the people who may restore it: the köşk manager and SYSTEM_ADMIN,
    // which is what the `ARCHIVE` scope says.
    if (
      course.archivedAt !== null &&
      !(await this.authz.can(
        user,
        { entity: ENTITIES.COURSE, id },
        SCOPES.ARCHIVE
      ))
    ) {
      throw new CourseNotFoundError(id);
    }
    // A DRAFT course is invisible to anyone but its köşk owner — surface it as
    // not-found rather than forbidden so its existence isn't leaked.
    if (course.status === CourseStatus.DRAFT) {
      const isOwner = await this.koskService.isOwner(course.koskId, userId);
      if (!isOwner) {
        throw new CourseNotFoundError(id);
      }
    }
    return course;
  }

  /** Ensures the course exists and its köşk is owned by `userId`, else throws. */
  async assertCourseOwner(courseId: string, userId: string): Promise<void> {
    const koskId = await this.courseRepo.findKoskId(courseId);
    if (koskId === null) {
      throw new CourseNotFoundError(courseId);
    }
    await this.koskService.assertOwner(koskId, userId);
  }

  async create(
    koskId: string,
    authorId: string,
    course: Omit<ICreateCourse, "koskId" | "authorId">
  ): Promise<ICourseDetail> {
    await this.koskService.assertOwner(koskId, authorId); // köşk owner only
    return this.courseRepo.create({
      ...withCanonicalTimeZone(course),
      koskId,
      authorId,
    });
  }

  async update(
    id: string,
    userId: string,
    updates: IUpdateCourse
  ): Promise<ICourse> {
    await this.assertCourseOwner(id, userId);
    const updated = await this.courseRepo.update(
      id,
      withCanonicalTimeZone(updates)
    );
    if (!updated) {
      throw new CourseNotFoundError(id);
    }
    return updated;
  }

  async replace(
    id: string,
    userId: string,
    data: IReplaceCourse
  ): Promise<ICourseDetail> {
    await this.assertCourseOwner(id, userId);
    return this.courseRepo.replace(id, userId, withCanonicalTimeZone(data));
  }

  // ---- session-level writes (MDRS-95) ----
  // Authorization for these three is `@Authz(SCOPES.EDIT, …)` on
  // LessonController, resolved against the lesson's parent course, so no
  // ownership assertion is repeated here.

  async createLesson(
    courseId: string,
    weekId: string,
    data: ICreateLesson
  ): Promise<ILessonMutation> {
    return this.courseRepo.createLesson(courseId, weekId, data);
  }

  async updateLesson(
    lessonId: string,
    expectedVersion: number,
    data: IUpdateLesson
  ): Promise<ILessonMutation> {
    return this.courseRepo.updateLesson(lessonId, expectedVersion, data);
  }

  /** Hides the lesson; nothing attached to it is deleted (MDRS-124). */
  async archiveLesson(lessonId: string): Promise<ILessonMutation> {
    return this.courseRepo.archiveLesson(lessonId);
  }

  // ---- hide / restore / delete (MDRS-124) ----
  // Authorization is `@Authz` on CourseController: `ARCHIVE` (the köşk
  // manager) for hide and restore, `DELETE` (SYSTEM_ADMIN only — it is on no
  // role row) for the real delete. Nothing is re-checked here.

  async archive(id: string, userId: string): Promise<void> {
    if (!(await this.courseRepo.archive(id, userId))) {
      throw new CourseNotFoundError(id);
    }
  }

  async restore(id: string): Promise<void> {
    if (!(await this.courseRepo.restore(id))) {
      throw new CourseNotFoundError(id);
    }
  }

  async delete(id: string, actorId: string): Promise<boolean> {
    const removed = await this.courseRepo.purge(id, actorId);
    if (!removed) throw new CourseNotFoundError(id);
    return true;
  }

  async enroll(
    user: AuthenticatedUser,
    courseId: string,
    student: StudentIdentity = {}
  ): Promise<IEnrollment> {
    const userId = user.sub;
    const course = await this.getDetail(courseId, user); // throws if missing
    const status = course.requiresApproval
      ? EnrollmentStatus.PENDING
      : EnrollmentStatus.ENROLLED;
    return this.courseRepo.enroll(userId, courseId, {
      status,
      studentName: student.name ?? null,
      studentEmail: student.email ?? null,
    });
  }

  async findPendingEnrollments(
    koskId: string,
    userId: string
  ): Promise<IPendingEnrollment[]> {
    await this.koskService.assertOwner(koskId, userId); // köşk owner only
    return this.courseRepo.findPendingByKosk(koskId);
  }

  async approveEnrollment(
    courseId: string,
    ownerId: string,
    studentId: string
  ): Promise<IEnrollment> {
    await this.assertCourseOwner(courseId, ownerId);
    const updated = await this.courseRepo.setEnrollmentStatus(
      studentId,
      courseId,
      EnrollmentStatus.ENROLLED
    );
    if (!updated) {
      throw new EnrollmentNotFoundError(courseId);
    }
    return updated;
  }

  async rejectEnrollment(
    courseId: string,
    ownerId: string,
    studentId: string
  ): Promise<boolean> {
    await this.assertCourseOwner(courseId, ownerId);
    // Only pending requests can be rejected; deleting an active or completed
    // enrollment must go through a deliberate unenroll flow, not "reject".
    const existing = await this.courseRepo.findEnrollment(studentId, courseId);
    if (!existing || existing.status !== EnrollmentStatus.PENDING) {
      throw new EnrollmentNotFoundError(courseId);
    }
    return this.courseRepo.deleteEnrollment(studentId, courseId);
  }

  async updateProgress(
    userId: string,
    courseId: string,
    progress: number,
    status?: EnrollmentStatus
  ): Promise<IEnrollment> {
    // Progress can only be recorded against an active enrollment. A pending
    // (awaiting-approval) or missing enrollment must not be silently promoted,
    // otherwise this endpoint would bypass the köşk owner's approval.
    const existing = await this.courseRepo.findEnrollment(userId, courseId);
    if (!existing || existing.status === EnrollmentStatus.PENDING) {
      throw new EnrollmentNotFoundError(courseId);
    }
    const resolvedStatus =
      status ??
      (progress >= 100
        ? EnrollmentStatus.COMPLETED
        : EnrollmentStatus.ENROLLED);
    const updated = await this.courseRepo.updateProgress(
      userId,
      courseId,
      progress,
      resolvedStatus
    );
    return updated as IEnrollment;
  }
}
