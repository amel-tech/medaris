import {
  ConflictError,
  type ErrorContext,
  NotFoundError,
} from "@medaris/common";

/** No account with that id, in the app or in the realm (MDRS-270). */
export class CourseNazirUnknownAccountError extends NotFoundError {
  static readonly code = "COURSE_NAZIR_UNKNOWN_ACCOUNT";

  constructor(userId: string, context?: ErrorContext) {
    super(
      CourseNazirUnknownAccountError.code,
      `No account ${userId} in the app or the realm; it cannot be made a ders nazırı`,
      context
    );
  }
}

/**
 * The person already holds a seat over the course: its müderris, a seat in
 * its medrese or its köşk, or a platform role. A post's permissions are told
 * apart from that seat's only by the person and the course, so changing or
 * ending the post would reach the seat's own (MDRS-270).
 */
export class CourseNazirHoldsSeatError extends ConflictError {
  static readonly code = "COURSE_NAZIR_HOLDS_SEAT";

  constructor(userId: string, courseId: string, context?: ErrorContext) {
    super(
      CourseNazirHoldsSeatError.code,
      `User ${userId} already holds a seat over course ${courseId}`,
      context
    );
  }
}
