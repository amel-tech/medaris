import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { env } from "~/env";
import { getKosk } from "~/features/courses/actions";
import {
  hasAssignments,
  mayHandInOn,
} from "~/features/courses/assignment-marks";
import { CoursePage } from "~/features/courses/components/course-page";
import { courseViewState, holdsSeat } from "~/features/courses/course-view";
import { introMetadata } from "~/features/courses/intro-metadata";
import { loadCourse } from "~/features/courses/load-course";
import {
  getCourseDecks,
  getCourseForMetadata,
  getMySubmissions,
  getRecordings,
  isSignedIn,
} from "~/features/courses/public-reads";
import { inviteHrefs } from "~/lib/invite-hrefs";

type Params = Promise<{ locale: string; courseId: string }>;
type SearchParams = Promise<{ tab?: string | string[] }>;

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

export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { courseId } = await params;
  const { tab } = await searchParams;
  const course = await loadCourse(courseId);
  if (!course) notFound();

  // Köşk name for the breadcrumb (CourseDetailResponse only carries koskId),
  // and whether it is unlisted: every enrollment there waits for approval
  // (MDRS-122), whatever the course's own `requiresApproval` says.
  // Where the talebe handed homework in, read only when a celse has homework
  // they may hand in (the programme's "Ödev teslim edilmedi" marks).
  // The decks are read only for a caller who holds a seat (the tab exists only then).
  const [kosk, signedIn, locale, recordings, handedIn, decks] =
    await Promise.all([
      getKosk(course.koskId),
      isSignedIn(),
      getLocale(),
      getRecordings(course.id),
      mayHandInOn(course) && hasAssignments(course)
        ? getMySubmissions(course.id)
        : null,
      (async () =>
        holdsSeat(courseViewState(course, await isSignedIn()))
          ? getCourseDecks(course.id)
          : null)(),
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
      nazarUrl={env.NAZAR_URL || null}
      recordings={recordings}
      handedIn={handedIn}
      decks={decks ?? []}
      initialTab={typeof tab === "string" ? tab : undefined}
    />
  );
}
