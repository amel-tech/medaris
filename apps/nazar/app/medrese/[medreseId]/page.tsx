import type { Metadata } from "next";
import { Suspense } from "react";
import { PanoLoading, PanoPage } from "~/features/pano/components/pano-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazar.Pano");
  return { title: t("title") };
}

/**
 * Pano (nazir 01): the medrese's dashboard, the page `/` opens for a person who
 * runs a medrese. Its loading state is a boundary here and not a `loading.tsx`,
 * which would also stand in for every section of the medrese under it.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ medreseId: string }>;
}) {
  const { medreseId } = await params;
  return (
    <Suspense fallback={<PanoLoading />}>
      <PanoPage madrasahId={medreseId} />
    </Suspense>
  );
}
