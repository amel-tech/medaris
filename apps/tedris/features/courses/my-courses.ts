import type { EnrolledCourseResponse } from "@medaris/services/tedrisat";

/**
 * The three sections of Derslerim (MDRS-159, design tedris/20), by the
 * enrollment's status: ENROLLED is "Devam eden", PENDING is "Başvurularım",
 * COMPLETED is "Tamamladığın". Each keeps the order the API gave, which is the
 * order the talebe enrolled in.
 */
export interface MyCourseSections {
  ongoing: EnrolledCourseResponse[];
  applications: EnrolledCourseResponse[];
  completed: EnrolledCourseResponse[];
  /** design tedris/20 "erişimi kaldırıldı": listed apart, with no way in */
  revoked: EnrolledCourseResponse[];
}

export const splitMyCourses = (
  courses: EnrolledCourseResponse[]
): MyCourseSections => {
  const sections: MyCourseSections = {
    ongoing: [],
    applications: [],
    completed: [],
    revoked: [],
  };
  for (const course of courses) {
    switch (course.enrollment.status) {
      case "ENROLLED":
        sections.ongoing.push(course);
        break;
      case "PENDING":
        sections.applications.push(course);
        break;
      case "COMPLETED":
        sections.completed.push(course);
        break;
      case "REVOKED":
        sections.revoked.push(course);
        break;
    }
  }
  return sections;
};

/** "28 Eylül 2026": a date as the page's locale writes it, in the viewer's zone. */
export const formatLongDate = (
  at: Date | string,
  locale: string,
  timeZone: string
): string => {
  const date = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(date);
};

/** "3 Eki Cmt 21:00": the day, weekday and clock of a session, in the viewer's zone. */
export const formatSessionMoment = (
  at: Date | string,
  locale: string,
  timeZone: string
): string => {
  const date = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(date);
};
