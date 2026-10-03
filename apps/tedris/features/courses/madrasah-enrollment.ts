import type { MadrasahCourseResponseEnrollmentStatusEnum } from "@medaris/services/tedrisat";

export type EnrollmentBadge = {
  variant: "brand" | "warning" | "success";
  /** Key under `tedris.MadrasahPage`. */
  labelKey: "statusEnrolled" | "statusPending" | "statusCompleted";
};

/**
 * The badge a course row wears for the caller's own enrollment: none when
 * they have none, "Devam ediyor" when enrolled, "Onay bekliyor" while the
 * course's staff have not approved the application.
 */
export const enrollmentBadge = (
  status: MadrasahCourseResponseEnrollmentStatusEnum | null | undefined
): EnrollmentBadge | null => {
  switch (status) {
    case "ENROLLED":
      return { variant: "brand", labelKey: "statusEnrolled" };
    case "PENDING":
      return { variant: "warning", labelKey: "statusPending" };
    case "COMPLETED":
      return { variant: "success", labelKey: "statusCompleted" };
    default:
      return null;
  }
};
