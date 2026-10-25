import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { isSignedIn } from "~/features/courses/public-reads";
import { DiscoverPage } from "~/features/discover/components/discover-page";
import { parseDiscoverQuery } from "~/features/discover/discover-query";
import { type DiscoverData, getDiscoverData } from "~/features/discover/reads";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tedris");
  return { title: `${t("DiscoverPage.title")} | Tedris` };
}

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = parseDiscoverQuery(await searchParams);
  let data: DiscoverData | null = null;
  try {
    data = await getDiscoverData(query);
  } catch (error) {
    // Said on the page as an Alert, not as an empty list (design tedris/02).
    console.error("Error fetching Keşfet:", error);
  }
  return (
    <DiscoverPage
      query={query}
      data={data}
      failed={data === null}
      signedIn={await isSignedIn()}
    />
  );
}
