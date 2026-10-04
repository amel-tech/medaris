import { Injectable } from "@nestjs/common";
import { BanRepository } from "../ban/ban.repository";
import { CourseRepository } from "./course.repository";
import { EnrollmentStatus } from "./domain/enrollment-status.enum";

/**
 * Whether someone is a talebe of a course right now (MDRS-150): an active
 * enrollment, ENROLLED or COMPLETED, that no ban bars. What writes made by a
 * talebe alone (notes, questions) ask, and not the route matrix, because
 * SYSTEM_ADMIN passes the guard on every course and the course team holds
 * `view_details` without being talebe.
 */
@Injectable()
export class ActiveTalebeService {
  // Both must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly courseRepo: CourseRepository,
    private readonly banRepo: BanRepository
  ) {}

  async isActive(userId: string, courseId: string): Promise<boolean> {
    const enrollment = await this.courseRepo.findEnrollment(userId, courseId);
    const active =
      enrollment?.status === EnrollmentStatus.ENROLLED ||
      enrollment?.status === EnrollmentStatus.COMPLETED;
    return active && !(await this.banRepo.isBarredFromCourse(userId, courseId));
  }
}
