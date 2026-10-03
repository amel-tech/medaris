export enum EnrollmentStatus {
  PENDING = "PENDING",
  ENROLLED = "ENROLLED",
  COMPLETED = "COMPLETED",
  /**
   * The course team took the talebe out of the course (MDRS-161). The row stays
   * as the record: the talebe sees the public page and nothing the enrolled
   * hold, and does not apply again on their own. Declared last: a Postgres
   * enum sorts in declaration order and the roster lists requests first.
   */
  REVOKED = "REVOKED",
}
