import { textFontsHref } from "@medaris/tokens/medaris-fonts";
import type { ReactNode } from "react";
import { HideUnderSegment } from "~/components/phone-menu/hide-under-segment";
import { PhoneChrome } from "~/components/phone-menu/phone-chrome";
import { loadCourseOrLeave } from "~/features/courses/load-course";

/**
 * The course page keeps its shadcn body until its own design lands, but it now
 * hosts parts of the unified system: the application window (tedris/07) and the
 * preview banner and card (tedris/14). The system's faces load with the
 * segment, as the medrese and session pages do; its stylesheet is part of the
 * app's one stylesheet, app/tedris.css (MDRS-281).
 */
export default async function CourseLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ courseId: string }>;
}) {
  // loading.tsx lets the page stream, and a streamed response has already sent
  // 200 by the time the page calls notFound(). The answer is read here, ahead
  // of the stream, so a draft or unknown id is a real 404, and a signed-out
  // visitor of an unlisted course is sent to sign in (MDRS-248).
  const { courseId } = await params;
  const course = await loadCourseOrLeave(courseId);
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link rel="stylesheet" href={textFontsHref} precedence="default" />
      {/* A talebe's course is Derslerim's; anyone else found it through Keşfet. */}
      <HideUnderSegment segment="lessons">
        <PhoneChrome
          section={course.enrollment ? "courses" : "discover"}
          title={course.title}
        />
      </HideUnderSegment>
      {children}
    </>
  );
}
