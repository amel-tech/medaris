import "@medaris/ui/medaris.css";
import { textFontsHref } from "@medaris/tokens/medaris-fonts";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { loadCourse } from "~/features/courses/load-course";

/**
 * The course page keeps its shadcn body until its own design lands, but it now
 * hosts parts of the unified system: the application window (tedris/07) and the
 * preview banner and card (tedris/14). The system's stylesheet and faces load
 * with the segment, as the medrese and session pages do.
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
  // of the stream, so a draft or unknown id is a real 404.
  const { courseId } = await params;
  if (!(await loadCourse(courseId))) notFound();
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link rel="stylesheet" href={textFontsHref} precedence="default" />
      {children}
    </>
  );
}
