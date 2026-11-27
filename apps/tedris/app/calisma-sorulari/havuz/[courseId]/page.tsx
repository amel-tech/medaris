import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PracticeTake } from "~/features/practice/components/practice-take";
import { poolRequestOf } from "~/features/practice/practice-model";

// Behind the sign-in middleware (not in `publicPages`), and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tedris.Practice");
  return { title: `${t("poolTitle")} | Tedris` };
}

/**
 * Solving a course's question pool (MDRS-248, Faz 4): every question of its
 * published sets (`?mod=ALL`), or `?mod=RANDOM&sayi=N` of them at random.
 * As on a set's page, the attempt is started (or the open one taken back,
 * whatever the mode) by the page in the browser, never by rendering it.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ mod?: string | string[]; sayi?: string | string[] }>;
}) {
  const { courseId } = await params;
  const request = poolRequestOf(await searchParams);
  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      <PracticeTake courseId={courseId} {...request} />
    </main>
  );
}
