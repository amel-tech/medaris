import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getMadrasah } from "~/features/courses/public-reads";

/**
 * Settles whether the medrese exists before `loading.tsx` streams its
 * skeleton. A `notFound()` thrown from the page itself arrives after the
 * response head is sent, so the answer would be HTTP 200 with the not-found
 * markup; thrown here, above the segment's Suspense boundary, it is a real 404.
 * `getMadrasah` is cached per request, so the page does not ask twice.
 */
export default async function MadrasahLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ madrasahId: string }>;
}) {
  const { madrasahId } = await params;
  if (!(await getMadrasah(madrasahId))) notFound();
  return children;
}
