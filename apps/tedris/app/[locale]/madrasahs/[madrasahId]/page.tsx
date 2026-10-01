import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "~/env";
import { MadrasahPage } from "~/features/courses/components/madrasah-page";
import { introMetadata } from "~/features/courses/intro-metadata";
import {
  getMadrasah,
  getMadrasahForMetadata,
  getMadrasahKosks,
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
  const madrasah = await getMadrasah(madrasahId);
  if (!madrasah) notFound();

  const { items: kosks } = await getMadrasahKosks(madrasahId);
  return <MadrasahPage madrasah={madrasah} kosks={kosks} />;
}
