import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "~/env";
import { getKosk, getKoskCourses } from "~/features/courses/actions";
import {
  KoskLoadError,
  KoskPage,
} from "~/features/courses/components/kosk-page";
import { introMetadata } from "~/features/courses/intro-metadata";
import {
  getKoskDecks,
  getKoskForMetadata,
  isSignedIn,
} from "~/features/courses/public-reads";

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
  let loaded: Awaited<ReturnType<typeof loadKosk>>;
  try {
    loaded = await loadKosk(koskId);
  } catch {
    // Already logged where it failed; said on the page as an Alert (design
    // tedris/04), not as the generic error page.
    return <KoskLoadError koskId={koskId} />;
  }
  if (!loaded) notFound();
  return <KoskPage {...loaded} />;
}

const loadKosk = async (koskId: string) => {
  const kosk = await getKosk(koskId);
  if (!kosk) return null;
  const [courses, decks, signedIn] = await Promise.all([
    getKoskCourses(koskId),
    getKoskDecks(koskId),
    isSignedIn(),
  ]);
  return { kosk, courses, decks, signedIn };
};
