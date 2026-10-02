import type { EnrolledCourseResponse } from "@medaris/services/tedrisat";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getMyCoursesWithApplications } from "~/features/courses/actions";
import { MyCoursesPage } from "~/features/courses/components/my-courses-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tedris");
  return { title: `${t("MyCoursesPage.title")} | Tedris` };
}

export default async function Page() {
  let courses: EnrolledCourseResponse[] | null = null;
  try {
    courses = await getMyCoursesWithApplications();
  } catch (error) {
    // Said on the page as an Alert, not as "you have no courses" (design tedris/20).
    console.error("Error fetching Derslerim:", error);
  }
  return <MyCoursesPage courses={courses} failed={courses === null} />;
}
