import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "~/env";
import { getKosk, getKoskCourses } from "~/features/courses/actions";
import { KoskPage } from "~/features/courses/components/kosk-page";
import { introMetadata } from "~/features/courses/intro-metadata";
import { getKoskForMetadata } from "~/features/courses/public-reads";

type Params = Promise<{ locale: string; koskId: string }>;

// Open to signed-out visitors (MDRS-122). The metadata is read with no token,
// so an unlisted köşk — 404 to a caller with no token — gets the generic
// title even when a signed-in member opens it by its link.
export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { locale, koskId } = await params;
  const kosk = await getKoskForMetadata(koskId);
  return introMetadata({
    subject: kosk && { title: kosk.name, description: kosk.description },
    path: `/${locale}/kosks/${koskId}`,
    siteName: "Tedris",
    metadataBase: new URL(env.NEXTAUTH_URL),
  });
}

export default async function Page({ params }: { params: Params }) {
  const { koskId } = await params;
  const kosk = await getKosk(koskId);
  if (!kosk) notFound();

  const courses = await getKoskCourses(koskId);
  return <KoskPage kosk={kosk} courses={courses} />;
}
