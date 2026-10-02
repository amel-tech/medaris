import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { env } from "~/env";
import { getKosk } from "~/features/courses/actions";
import { CoursePage } from "~/features/courses/components/course-page";
import { introMetadata } from "~/features/courses/intro-metadata";
import { loadCourse } from "~/features/courses/load-course";
import {
  getCourseForMetadata,
  isSignedIn,
} from "~/features/courses/public-reads";
import { inviteHrefs } from "~/lib/invite-hrefs";

type Params = Promise<{ locale: string; courseId: string }>;

// Open to signed-out visitors (MDRS-122); its lessons are not. The metadata
// is read with no token: a draft, a hidden course or a course of an unlisted
// köşk gets the generic title.
export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { locale, courseId } = await params;
  const course = await getCourseForMetadata(courseId);
  return introMetadata({
    subject: course && {
      title: course.title,
      description: course.subtitle ?? course.description,
    },
    path: `/${locale}/courses/${courseId}`,
    siteName: "Tedris",
    metadataBase: new URL(env.NEXTAUTH_URL),
  });
}

export default async function Page({ params }: { params: Params }) {
  const { courseId } = await params;
  const course = await loadCourse(courseId);
  if (!course) notFound();

  // Köşk name for the breadcrumb (CourseDetailResponse only carries koskId),
  // and whether it is unlisted: every enrollment there waits for approval
  // (MDRS-122), whatever the course's own `requiresApproval` says.
  const [kosk, signedIn, locale] = await Promise.all([
    getKosk(course.koskId),
    isSignedIn(),
    getLocale(),
  ]);
  const hrefs = inviteHrefs(locale, `/courses/${course.id}`);

  return (
    <CoursePage
      course={course}
      koskName={kosk?.name ?? null}
      approvalRequired={course.requiresApproval || Boolean(kosk?.isPrivate)}
      signedIn={signedIn}
      signInHref={hrefs.signIn}
      registerHref={hrefs.register}
      nazirUrl={env.NAZIR_URL || null}
    />
  );
}
