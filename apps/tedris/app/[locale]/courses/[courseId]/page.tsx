import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "~/env";
import { getCourse, getKosk } from "~/features/courses/actions";
import { CoursePage } from "~/features/courses/components/course-page";
import { introMetadata } from "~/features/courses/intro-metadata";
import {
  getCourseForMetadata,
  isSignedIn,
} from "~/features/courses/public-reads";

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
  const course = await getCourse(courseId);
  if (!course) notFound();

  // Köşk name for the breadcrumb (CourseDetailResponse only carries koskId),
  // and whether it is unlisted: every enrollment there waits for approval
  // (MDRS-122), whatever the course's own `requiresApproval` says.
  const [kosk, signedIn] = await Promise.all([
    getKosk(course.koskId),
    isSignedIn(),
  ]);

  return (
    <CoursePage
      course={course}
      koskName={kosk?.name ?? null}
      approvalRequired={course.requiresApproval || Boolean(kosk?.isPrivate)}
      signedIn={signedIn}
      nazirUrl={env.NAZIR_URL || null}
    />
  );
}
