import { ConflictError } from "@medaris/common";

/**
 * The editor's copy of the course is stale: someone saved it after it was
 * loaded (MDRS-95). The client must reload rather than overwrite.
 */
export class CourseVersionConflictError extends ConflictError {
  static readonly code = "COURSE_VERSION_CONFLICT";

  constructor(courseId: string, expectedVersion: number) {
    super(
      CourseVersionConflictError.code,
      `Course ${courseId} has changed since version ${expectedVersion} was loaded`,
      { courseId, expectedVersion }
    );
  }
}
