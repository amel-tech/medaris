import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "~/env";
import { MadrasahPage } from "~/features/courses/components/madrasah-page";
import { introMetadata } from "~/features/courses/intro-metadata";
import {
  getMadrasah,
  getMadrasahForMetadata,
  getMadrasahOverview,
  isSignedIn,
} from "~/features/courses/public-reads";

type Params = Promise<{ locale: string; madrasahId: string }>;

// Open to signed-out visitors (MDRS-122).
export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { locale, madrasahId } = await params;
  const madrasah = await getMadrasahForMetadata(madrasahId);
  return introMetadata({
    subject: madrasah && {
      title: madrasah.name,
      description: madrasah.description,
    },
    path: `/${locale}/madrasahs/${madrasahId}`,
    siteName: "Tedris",
    metadataBase: new URL(env.NEXTAUTH_URL),
  });
}

export default async function Page({ params }: { params: Params }) {
  const { madrasahId } = await params;
  const [madrasah, overview, signedIn] = await Promise.all([
    getMadrasah(madrasahId),
    getMadrasahOverview(madrasahId),
    isSignedIn(),
  ]);
  if (!madrasah || !overview) notFound();

  return (
    <MadrasahPage madrasah={madrasah} overview={overview} signedIn={signedIn} />
  );
}
