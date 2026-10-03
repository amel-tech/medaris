import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ToastHost } from "~/components/toast-host";
import { getSession } from "~/features/courses/public-reads";

/**
 * Settles whether the session exists, and whether this caller may see it,
 * before `loading.tsx` streams its skeleton: a `notFound()` thrown from the
 * page itself arrives after the response head is sent and would answer HTTP
 * 200 with the not-found markup. Thrown here it is a real 404. `getSession` is
 * cached per request, so the page does not ask twice.
 */
export default async function SessionLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const { courseId, lessonId } = await params;
  if (!(await getSession(courseId, lessonId))) notFound();
  return <ToastHost>{children}</ToastHost>;
}
