import { ArrowRightIcon, BookOpenIcon } from "@medaris/icons/ssr";
import type { TaughtCourseRef } from "@medaris/services/tedrisat";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * The courses the caller teaches in köşks they do not manage, under the köşk
 * table. `managedBy=me` leaves those köşks off the list, so without this a
 * nazım who also teaches elsewhere would have no way left to reach that
 * course in nizam.
 */
export async function TaughtCourses({
  courses,
}: {
  courses: TaughtCourseRef[];
}) {
  const t = await getTranslations("nizam");
  if (courses.length === 0) return null;
  return (
    <section className="mt-12">
      <h2 className="mds-h2">{t("KosksPage.taughtTitle")}</h2>
      <p className="mds-caption mb-4 mt-1">
        {t("KosksPage.taughtDescription")}
      </p>
      <ul className="divide-y rounded-lg border">
        {courses.map((course) => (
          <li key={course.id}>
            <Link
              href={`/kosks/${course.koskId}/courses/${course.id}/edit`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40"
            >
              <BookOpenIcon className="size-4 text-muted-foreground" />
              <span className="flex-1 font-medium">{course.title}</span>
              <ArrowRightIcon className="size-4 text-muted-foreground rtl:rotate-180" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
